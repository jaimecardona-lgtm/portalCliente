"""Documentos de operación del cliente final: validación, rutas, autorización y compensaciones.

Responsabilidad: subir, listar, firmar, reemplazar y retirar documentos. Todas las lecturas y
escrituras de datos pasan por la sesión `portal_app` (RLS). La autorización se valida
explícitamente antes de tocar Storage.

Reglas de autorización (todas necesarias):
1. Identidad verificada y empresa activa (`RequestContext`, resuelto por FastAPI).
2. La operación o el documento son visibles para la persona: membresía de cliente final activa y membresía de
   tenant activa (RLS).
3. Subir, reemplazar y retirar exige rol `client_admin` del cliente final de ese documento.
4. El prefijo de Storage no concede acceso: la ruta solo se usa después de validar lo anterior.

Compensaciones (ver docs/fase-12-documentos-storage.md):
- Subida exitosa + INSERT fallido: se intenta borrar el objeto; si falla, se encola `insert_failed`.
- Subida fallida parcialmente: se intenta borrar; si falla, se encola `upload_incomplete`.
- Reemplazo: la nueva versión se sube antes de tocar la base. La referencia vigente cambia y el
  objeto anterior se encola EN LA MISMA TRANSACCIÓN. Después se intenta borrar; si falla, queda pendiente.
- Retirada: igual que el reemplazo. Nunca se borra un objeto que siga siendo la referencia vigente.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.errors import AccessDenied, AppError, Conflict, NotFound
from app.db.session import activate_request_security
from app.services.access import RequestContext
from app.services.storage import ObjectStorage, StorageError

log = logging.getLogger("app.documents")

MAX_BYTES = 5 * 1024 * 1024
# tipo MIME -> (extensiones admitidas en el nombre, extensión de almacenamiento, firmas de contenido)
ALLOWED_TYPES: dict[str, tuple[frozenset[str], str, tuple[bytes, ...]]] = {
    "application/pdf": (frozenset({".pdf"}), ".pdf", (b"%PDF-",)),
    "image/png": (frozenset({".png"}), ".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/jpeg": (frozenset({".jpg", ".jpeg"}), ".jpg", (b"\xff\xd8\xff",)),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
        frozenset({".xlsx"}),
        ".xlsx",
        (b"PK\x03\x04",),
    ),
}
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class DocumentError(AppError):
    status_code = 422
    code = "invalid_document"


@dataclass(frozen=True)
class ValidatedFile:
    file_name: str
    mime_type: str
    extension: str
    size_bytes: int
    sha256: str


def validate_file(data: bytes, declared_mime: str, raw_name: str) -> ValidatedFile:
    """Valida tamaño, tipo, nombre, extensión y contenido real. No escribe nada."""
    if not data:
        raise DocumentError("El archivo está vacío.", code="file_empty", status_code=422)
    if len(data) > MAX_BYTES:
        raise DocumentError(
            "El archivo supera el tamaño máximo de 5 MB.", code="file_too_large", status_code=413
        )
    if declared_mime not in ALLOWED_TYPES:
        raise DocumentError("Tipo de archivo no admitido.", code="unsupported_type", status_code=415)

    name = PurePosixPath(raw_name.replace("\\", "/")).name.strip()
    if not name or len(name) > 200 or _CONTROL.search(name):
        raise DocumentError("Nombre de archivo no válido.", code="invalid_file_name", status_code=422)

    allowed_names, storage_ext, signatures = ALLOWED_TYPES[declared_mime]
    suffix = PurePosixPath(name.lower()).suffix
    if suffix not in allowed_names:
        raise DocumentError(
            "La extensión no corresponde al tipo de archivo.", code="extension_mismatch", status_code=415
        )
    if not any(data.startswith(sig) for sig in signatures):
        raise DocumentError(
            "El contenido no corresponde al tipo declarado.", code="content_mismatch", status_code=415
        )
    if declared_mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "[Content_Types].xml" not in archive.namelist():
                    raise DocumentError(
                        "El contenido no es una hoja de cálculo válida.",
                        code="content_mismatch",
                        status_code=415,
                    )
        except zipfile.BadZipFile as exc:
            raise DocumentError(
                "El contenido no es una hoja de cálculo válida.", code="content_mismatch", status_code=415
            ) from exc

    return ValidatedFile(
        file_name=name,
        mime_type=declared_mime,
        extension=storage_ext,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )


def build_object_path(
    tenant_id: UUID,
    client_account_id: UUID,
    operation_id: UUID,
    document_id: UUID,
    file_uuid: UUID,
    extension: str,
) -> str:
    """Ruta interna del objeto.

    Solo UUID generados por la aplicación: nunca nombres de empresas ni de archivos.
    """
    if extension not in {ext for _, ext, _ in ALLOWED_TYPES.values()}:
        raise ValueError("Extensión de almacenamiento no permitida.")
    return (
        f"tenants/{tenant_id}/clients/{client_account_id}/operations/{operation_id}"
        f"/documents/{document_id}/{file_uuid}{extension}"
    )


# ---------------------------------------------------------------------------
# Consultas con RLS
# ---------------------------------------------------------------------------


def _operation_scope(session: Session, operation_id: UUID) -> dict[str, Any]:
    row = (
        session.execute(
            text("SELECT id, tenant_id, client_account_id FROM operation_refs WHERE id = :id"),
            {"id": operation_id},
        )
        .mappings()
        .first()
    )
    if row is None or row["client_account_id"] is None:
        raise NotFound("La operación no existe.", code="operation_not_found")
    return dict(row)


def _is_client_admin(session: Session, user_id: UUID, client_account_id: UUID) -> bool:
    row = session.execute(
        text(
            """
            SELECT 1 FROM client_memberships c
            JOIN tenant_memberships t ON t.user_id = c.user_id AND t.tenant_id = c.tenant_id
            WHERE c.user_id = :u AND c.client_account_id = :c
              AND c.active AND c.role = 'client_admin' AND t.active
            """
        ),
        {"u": user_id, "c": client_account_id},
    ).first()
    return row is not None


def _require_admin(session: Session, ctx: RequestContext, client_account_id: UUID) -> None:
    if not _is_client_admin(session, ctx.user_id, client_account_id):
        raise AccessDenied(
            "Solo un administrador del cliente puede gestionar documentos.",
            code="role_cannot_manage_documents",
        )


def _visible_document(session: Session, document_id: UUID) -> dict[str, Any]:
    row = (
        session.execute(
            text(
                """
            SELECT id, tenant_id, client_account_id, operation_id, file_name, mime_type, size_bytes, sha256,
                   storage_path, version, status, updated_at
            FROM client_documents WHERE id = :id
            """
            ),
            {"id": document_id},
        )
        .mappings()
        .first()
    )
    if row is None or row["status"] != "available" or row["storage_path"] is None:
        raise NotFound("El documento no existe.", code="document_not_found")
    return dict(row)


def _summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "operation_id": str(row["operation_id"]),
        "file_name": row["file_name"],
        "mime_type": row["mime_type"],
        "size_bytes": int(row["size_bytes"]),
        "sha256": row["sha256"],
        "version": int(row["version"]),
        "status": row["status"],
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


# ---------------------------------------------------------------------------
# Compensaciones
# ---------------------------------------------------------------------------


def _enqueue_cleanup(session: Session, tenant_id: UUID, path: str, reason: str) -> None:
    # Sin ON CONFLICT: esa cláusula exige leer la tabla y el portal solo tiene permiso de inserción.
    # Las rutas contienen UUID nuevos, así que no puede haber colisiones legítimas.
    session.execute(
        text(
            """
            INSERT INTO storage_cleanup_jobs (tenant_id, storage_path, reason)
            VALUES (:tenant, :path, :reason)
            """
        ),
        {"tenant": tenant_id, "path": path, "reason": reason},
    )


def _enqueue_cleanup_in_new_session(
    session_factory: sessionmaker[Session], settings: Settings, ctx: RequestContext, path: str, reason: str
) -> bool:
    """Encola en una sesión nueva (la de la petición puede estar abortada).

    Devuelve False si tampoco se puede encolar.
    """
    session = session_factory()
    try:
        activate_request_security(session, app_role=settings.database_app_role, user_id=ctx.user_id)
        _enqueue_cleanup(session, ctx.tenant_id, path, reason)
        session.commit()
        return True
    except Exception:  # noqa: BLE001 - se registra el tipo; el mensaje puede contener datos de conexión
        log.error("No se pudo encolar la limpieza (%s) del objeto %s.", reason, path)
        session.rollback()
        return False
    finally:
        session.close()


def _best_effort_delete(
    storage: ObjectStorage, session_factory, settings, ctx, path: str, reason: str
) -> str:
    """Intenta borrar un objeto huérfano. Si no puede, lo deja registrado. Devuelve 'done' o 'pending'."""
    try:
        storage.delete([path])
        return "done"
    except StorageError:
        _enqueue_cleanup_in_new_session(session_factory, settings, ctx, path, reason)
        return "pending"


# ---------------------------------------------------------------------------
# Casos de uso
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DocumentDeps:
    session: Session
    ctx: RequestContext
    storage: ObjectStorage
    settings: Settings
    session_factory: sessionmaker[Session]


def list_documents(deps: DocumentDeps, operation_id: UUID) -> list[dict[str, Any]]:
    _operation_scope(deps.session, operation_id)  # 404 si la operación no es visible
    rows = (
        deps.session.execute(
            text(
                """
            SELECT id, operation_id, file_name, mime_type, size_bytes, sha256, version, status, updated_at
            FROM client_documents WHERE operation_id = :op AND status = 'available'
            ORDER BY file_name, id
            """
            ),
            {"op": operation_id},
        )
        .mappings()
        .all()
    )
    return [_summary(dict(r)) for r in rows]


def upload_document(
    deps: DocumentDeps, operation_id: UUID, data: bytes, declared_mime: str, raw_name: str
) -> dict[str, Any]:
    session, ctx, storage = deps.session, deps.ctx, deps.storage
    scope = _operation_scope(session, operation_id)
    _require_admin(session, ctx, scope["client_account_id"])
    file = validate_file(data, declared_mime, raw_name)

    document_id, file_uuid = uuid4(), uuid4()
    path = build_object_path(
        scope["tenant_id"], scope["client_account_id"], operation_id, document_id, file_uuid, file.extension
    )
    try:
        storage.upload(path, data, file.mime_type)
    except StorageError as exc:
        _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, path, "upload_incomplete")
        raise AppError(
            "El almacenamiento no está disponible. Inténtelo de nuevo.",
            code="storage_unavailable",
            status_code=502,
        ) from exc

    try:
        with session.begin_nested():
            session.execute(
                text(
                    """
                    INSERT INTO client_documents (id, tenant_id, client_account_id, operation_id, file_name,
                        mime_type,
                        size_bytes, sha256, storage_path, version, status, uploaded_by)
                    VALUES (:id, :tenant, :client, :op, :name, :mime, :size, :sha, :path, 1, 'available', :me)
                    """
                ),
                {
                    "id": document_id,
                    "tenant": scope["tenant_id"],
                    "client": scope["client_account_id"],
                    "op": operation_id,
                    "name": file.file_name,
                    "mime": file.mime_type,
                    "size": file.size_bytes,
                    "sha": file.sha256,
                    "path": path,
                    "me": ctx.user_id,
                },
            )
            _event(session, document_id, scope, ctx, "uploaded", 1, file.sha256)
        session.commit()
    except Exception as exc:
        session.rollback()
        # Subida correcta pero sin referencia: el objeto no debe quedar huérfano.
        _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, path, "insert_failed")
        raise AppError(
            "No fue posible guardar el documento. Inténtelo de nuevo.",
            code="persistence_failed",
            status_code=503,
        ) from exc

    return {
        "id": str(document_id),
        "operation_id": str(operation_id),
        "file_name": file.file_name,
        "mime_type": file.mime_type,
        "size_bytes": file.size_bytes,
        "sha256": file.sha256,
        "version": 1,
        "status": "available",
        "updated_at": None,
    }


def signed_download_link(deps: DocumentDeps, document_id: UUID) -> dict[str, Any]:
    doc = _visible_document(deps.session, document_id)
    try:
        url = deps.storage.sign_download(doc["storage_path"], deps.settings.storage_signed_url_seconds)
    except StorageError as exc:
        raise AppError(
            "El almacenamiento no está disponible. Inténtelo de nuevo.",
            code="storage_unavailable",
            status_code=502,
        ) from exc
    # La URL se devuelve al cliente y no se guarda en ninguna tabla.
    return {"url": url, "expires_in_seconds": deps.settings.storage_signed_url_seconds}


def replace_document(
    deps: DocumentDeps, document_id: UUID, data: bytes, declared_mime: str, raw_name: str
) -> dict[str, Any]:
    session, ctx, storage = deps.session, deps.ctx, deps.storage
    doc = _visible_document(session, document_id)
    _require_admin(session, ctx, doc["client_account_id"])
    file = validate_file(data, declared_mime, raw_name)
    scope = {
        "tenant_id": doc["tenant_id"],
        "client_account_id": doc["client_account_id"],
        "operation_id": doc["operation_id"],
    }
    new_uuid = uuid4()
    new_path = build_object_path(
        doc["tenant_id"], doc["client_account_id"], doc["operation_id"], document_id, new_uuid, file.extension
    )
    old_path = doc["storage_path"]
    new_version = int(doc["version"]) + 1

    try:
        storage.upload(new_path, data, file.mime_type)
    except StorageError as exc:
        _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, new_path, "upload_incomplete")
        raise AppError(
            "El almacenamiento no está disponible. Inténtelo de nuevo.",
            code="storage_unavailable",
            status_code=502,
        ) from exc

    try:
        with session.begin_nested():
            result = session.execute(
                text(
                    """
                    UPDATE client_documents
                    SET file_name = :name, mime_type = :mime, size_bytes = :size, sha256 = :sha,
                        storage_path = :new_path, version = :version, updated_at = now(), updated_by = :me
                    WHERE id = :id AND status = 'available' AND storage_path = :old_path
                    """
                ),
                {
                    "name": file.file_name,
                    "mime": file.mime_type,
                    "size": file.size_bytes,
                    "sha": file.sha256,
                    "new_path": new_path,
                    "version": new_version,
                    "me": ctx.user_id,
                    "id": document_id,
                    "old_path": old_path,
                },
            )
            if result.rowcount != 1:
                raise Conflict(
                    "El documento cambió mientras se reemplazaba. Vuelva a intentarlo.",
                    code="document_changed",
                )
            _event(session, document_id, scope, ctx, "replaced", new_version, file.sha256)
            # El objeto anterior queda registrado en la misma transacción: si el proceso se cae, no se pierde.
            _enqueue_cleanup(session, doc["tenant_id"], old_path, "replaced")
        session.commit()
    except Conflict:
        session.rollback()
        _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, new_path, "insert_failed")
        raise
    except Exception as exc:
        session.rollback()
        _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, new_path, "insert_failed")
        raise AppError(
            "No fue posible guardar la nueva versión. Inténtelo de nuevo.",
            code="persistence_failed",
            status_code=503,
        ) from exc

    cleanup = _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, old_path, "replaced")
    return {
        "id": str(document_id),
        "operation_id": str(doc["operation_id"]),
        "file_name": file.file_name,
        "mime_type": file.mime_type,
        "size_bytes": file.size_bytes,
        "sha256": file.sha256,
        "version": new_version,
        "status": "available",
        "previous_object_cleanup": cleanup,
    }


def remove_document(deps: DocumentDeps, document_id: UUID) -> dict[str, Any]:
    session, ctx, storage = deps.session, deps.ctx, deps.storage
    doc = _visible_document(session, document_id)
    _require_admin(session, ctx, doc["client_account_id"])
    old_path = doc["storage_path"]

    with session.begin_nested():
        result = session.execute(
            text(
                """
                UPDATE client_documents
                SET status = 'removed', storage_path = NULL, removed_at = now(),
                    removed_by = :me, updated_by = :me,
                    updated_at = now()
                WHERE id = :id AND status = 'available' AND storage_path = :old_path
                """
            ),
            {"me": ctx.user_id, "id": document_id, "old_path": old_path},
        )
        if result.rowcount != 1:
            raise Conflict(
                "El documento cambió mientras se retiraba. Vuelva a intentarlo.", code="document_changed"
            )
        _event(
            session,
            document_id,
            {"tenant_id": doc["tenant_id"], "client_account_id": doc["client_account_id"]},
            ctx,
            "removed",
            int(doc["version"]),
            doc["sha256"],
        )
        _enqueue_cleanup(session, doc["tenant_id"], old_path, "removed")
    session.commit()

    cleanup = _best_effort_delete(storage, deps.session_factory, deps.settings, ctx, old_path, "removed")
    return {"id": str(document_id), "status": "removed", "storage_cleanup": cleanup}


def _event(
    session: Session,
    document_id: UUID,
    scope: dict[str, Any],
    ctx: RequestContext,
    action: str,
    version: int,
    sha: str | None,
) -> None:
    session.execute(
        text(
            """
            INSERT INTO client_document_events
                (document_id, tenant_id, client_account_id, actor_id, action, version, sha256)
            VALUES (:doc, :tenant, :client, :actor, :action, :version, :sha)
            """
        ),
        {
            "doc": document_id,
            "tenant": scope["tenant_id"],
            "client": scope["client_account_id"],
            "actor": ctx.user_id,
            "action": action,
            "version": version,
            "sha": sha,
        },
    )
