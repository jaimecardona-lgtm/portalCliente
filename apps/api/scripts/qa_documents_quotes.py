"""Carga idempotente de documentos y cotizaciones QA.

Por defecto simula y no escribe. `--apply` y `--rollback` modifican solo el lote
`qa-docs-quotes-2026-11-17` en empresas `QA_SYNTHETIC_ONLY`.

Uso, desde apps/api:

    .\\.venv\\Scripts\\python.exe scripts\\qa_documents_quotes.py
    .\\.venv\\Scripts\\python.exe scripts\\qa_documents_quotes.py --apply
    .\\.venv\\Scripts\\python.exe scripts\\qa_documents_quotes.py --rollback

Revertir borra únicamente las filas anotadas en `qa_seed_records` de este lote y
los objetos de Storage cuya ruta quedó en ese libro. No toca operaciones, solicitudes,
roles ni membresías.

No aplicar en remoto hasta revisar la migración `20261117000100`.
La clave de Storage, si hace falta, permanece en el entorno del backend y no se imprime.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.db.session import create_db_engine  # noqa: E402
from app.services.documents import build_object_path  # noqa: E402
from app.services.qa_catalog import (  # noqa: E402
    BATCH,
    CAPACITY_ACCOUNT,
    CLM_ACCOUNT,
    DOCUMENTS,
    QUOTE_NOTE,
    QUOTES,
    AccountPlan,
    QaGuardError,
    assert_qa_only,
)
from app.services.storage import ObjectStorage, build_storage  # noqa: E402

STAFF_USER = UUID("ac40c358-7a6f-4b0d-85c9-5b0508daebc0")


def _print(line: str) -> None:
    print(line)


def _role(session: Session, user_id: UUID, tenant_id: UUID | None) -> None:
    session.execute(text('SET LOCAL ROLE "portal_app"'))
    session.execute(text("SELECT set_config('app.current_user_id', :u, true)"), {"u": str(user_id)})
    if tenant_id is not None:
        session.execute(text("SELECT set_config('app.staff_tenant_id', :t, true)"), {"t": str(tenant_id)})


def _confirm_staff(session: Session, user_id: UUID) -> None:
    _role(session, user_id, None)
    row = (
        session.execute(
            text(
                """
                SELECT staff_role, tenant_scope, active
                FROM platform_staff
                WHERE user_id = portal_current_user_id()
                """
            )
        )
        .mappings()
        .first()
    )
    if (
        row is None
        or row["active"] is not True
        or row["staff_role"] != "platform_admin"
        or row["tenant_scope"] != "qa_synthetic_only"
    ):
        raise QaGuardError("La cuenta interna no es platform_admin de alcance QA. No se continúa.")


def _visible_tenants(session: Session, user_id: UUID) -> list[dict[str, object]]:
    _role(session, user_id, None)
    rows = session.execute(
        text(
            """
            SELECT id::text AS id, segment, external_tenant_id, integration_status, verified_at
            FROM tenants
            ORDER BY id
            """
        )
    ).mappings().all()
    return [dict(row) for row in rows]


def _tables_ready(session: Session) -> bool:
    row = session.execute(
        text(
            """
            SELECT to_regclass('public.quotes') IS NOT NULL
               AND to_regclass('public.qa_seed_records') IS NOT NULL
            """
        )
    ).scalar()
    return bool(row)


def _simulate(session: Session, user_id: UUID) -> None:
    tenants = _visible_tenants(session, user_id)
    assert_qa_only(tenants)
    _print(f"Empresas visibles y comprobadas como QA: {len(tenants)}.")
    _print(f"Lote: {BATCH}.")
    _print("Simulación. No se escribe en PostgreSQL ni en Storage.")
    for account in (CAPACITY_ACCOUNT, CLM_ACCOUNT):
        _print(f"Cuenta {account.account_id} · {account.legal_name} · tenant {account.tenant_id}")
    for document in DOCUMENTS:
        content = document.content()
        _print(
            f"Documento {document.document_id} · {document.file_name} · "
            f"{len(content)} bytes · sha256 {document.sha256()}"
        )
    for quote in QUOTES:
        _print(
            f"Cotización {quote.quote_id} · {quote.number} · {quote.status} · "
            f"vigente hasta {quote.valid_until} · {len(quote.lines)} conceptos"
        )
    _print("El procedimiento no modifica operation_refs, requests, roles ni membresías.")
    _print("Para retirar después: scripts/qa_documents_quotes.py --rollback")


def _seed_is_owned(session: Session, entity: str, entity_id: UUID, tenant_id: UUID) -> bool:
    """Only objects recorded by this exact batch may be reused or removed."""
    return session.execute(
        text(
            """
            SELECT 1 FROM qa_seed_records
            WHERE batch = :batch AND entity = :entity
              AND entity_id = :id AND tenant_id = :tenant
            """
        ),
        {"batch": BATCH, "entity": entity, "id": entity_id, "tenant": tenant_id},
    ).first() is not None


def _insert_account(session: Session, account: AccountPlan, user_id: UUID) -> None:
    del user_id
    existing = session.execute(
        text("SELECT legal_name, tax_id FROM client_accounts WHERE id = :id"),
        {"id": account.account_id},
    ).mappings().first()
    if existing is not None:
        if (
            not _seed_is_owned(session, "client_account", account.account_id, account.tenant_id)
            or existing["legal_name"] != account.legal_name
            or existing["tax_id"] != account.tax_id
        ):
            raise QaGuardError(
                "La cuenta documental coincide con un registro ajeno o alterado. No se continúa."
            )
        return

    inserted = session.execute(
        text(
            """
            INSERT INTO client_accounts (id, tenant_id, legal_name, tax_id, origin)
            VALUES (:id, :tenant, :name, :tax, 'portal_manual')
            ON CONFLICT (id) DO NOTHING
            RETURNING id
            """
        ),
        {
            "id": account.account_id,
            "tenant": account.tenant_id,
            "name": account.legal_name,
            "tax": account.tax_id,
        },
    ).first()
    if inserted is not None:
        session.execute(
            text(
                """
                INSERT INTO qa_seed_records (batch, entity, entity_id, tenant_id)
                VALUES (:batch, 'client_account', :id, :tenant)
                ON CONFLICT DO NOTHING
                """
            ),
            {"batch": BATCH, "id": account.account_id, "tenant": account.tenant_id},
        )


def _apply(session: Session, user_id: UUID, storage: ObjectStorage, uploaded_paths: list[str]) -> None:
    if not _tables_ready(session):
        raise QaGuardError("Falta la migración 20261117000100. No se escribe nada.")
    tenants = _visible_tenants(session, user_id)
    assert_qa_only(tenants)
    targets = {CAPACITY_ACCOUNT.tenant_id, CLM_ACCOUNT.tenant_id}
    visible = {UUID(str(row["id"])) for row in tenants}
    if not targets <= visible:
        raise QaGuardError("Capacity o CLM no están en el alcance visible. No se escribe nada.")
    for account in (CAPACITY_ACCOUNT, CLM_ACCOUNT):
        with session.begin_nested():
            _role(session, user_id, account.tenant_id)
            _insert_account(session, account, user_id)
    for document in DOCUMENTS:
        with session.begin_nested():
            _role(session, user_id, document.tenant_id)
            exists = session.execute(
                text("SELECT 1 FROM client_documents WHERE id = :id"),
                {"id": document.document_id},
            ).first()
            if exists is not None:
                existing = session.execute(
                    text(
                        """
                        SELECT file_name, sha256, storage_path, client_account_id
                        FROM client_documents WHERE id = :id
                        """
                    ),
                    {"id": document.document_id},
                ).mappings().one()
                if (
                    not _seed_is_owned(session, "client_document", document.document_id, document.tenant_id)
                    or existing["file_name"] != document.file_name
                    or existing["sha256"] != document.sha256()
                    or existing["storage_path"] != document.storage_path
                    or existing["client_account_id"] != document.account_id
                ):
                    raise QaGuardError("Documento QA coincidente ajeno o alterado. No se continúa.")
                continue
            if exists is None:
                content = document.content()
                path = build_object_path(
                    document.tenant_id,
                    document.account_id,
                    None,
                    document.document_id,
                    document.file_uuid,
                    ".pdf",
                )
                storage.upload(path, content, "application/pdf")
                uploaded_paths.append(path)
                session.execute(
                    text(
                        """
                        INSERT INTO client_documents (
                            id, tenant_id, client_account_id, operation_id, file_name, mime_type,
                            size_bytes, sha256, storage_path, version, status, uploaded_by
                        )
                        VALUES (
                            :id, :tenant, :account, NULL, :name, 'application/pdf',
                            :size, :sha, :path, 1, 'available', :user
                        )
                        """
                    ),
                    {
                        "id": document.document_id,
                        "tenant": document.tenant_id,
                        "account": document.account_id,
                        "name": document.file_name,
                        "size": len(content),
                        "sha": document.sha256(),
                        "path": path,
                        "user": user_id,
                    },
                )
                session.execute(
                    text(
                        """
                        INSERT INTO client_document_events (
                            document_id, tenant_id, client_account_id, actor_id, action, version, sha256
                        )
                        VALUES (:doc, :tenant, :account, :user, 'uploaded', 1, :sha)
                        """
                    ),
                    {
                        "doc": document.document_id,
                        "tenant": document.tenant_id,
                        "account": document.account_id,
                        "user": user_id,
                        "sha": document.sha256(),
                    },
                )
            session.execute(
                text(
                    """
                    INSERT INTO qa_seed_records (batch, entity, entity_id, tenant_id, storage_path)
                    VALUES (:batch, 'client_document', :id, :tenant, :path)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "batch": BATCH,
                    "id": document.document_id,
                    "tenant": document.tenant_id,
                    "path": document.storage_path,
                },
            )
    for quote in QUOTES:
        with session.begin_nested():
            _role(session, user_id, quote.tenant_id)
            exists = session.execute(
                text("SELECT 1 FROM quotes WHERE id = :id"),
                {"id": quote.quote_id},
            ).first()
            if exists is not None:
                existing = session.execute(
                    text("SELECT number, source, external_id FROM quotes WHERE id = :id"),
                    {"id": quote.quote_id},
                ).mappings().one()
                if (
                    not _seed_is_owned(session, "quote", quote.quote_id, quote.tenant_id)
                    or existing["number"] != quote.number
                    or existing["source"] != "qa_synthetic"
                    or existing["external_id"] != quote.external_id
                ):
                    raise QaGuardError("Cotización QA coincidente ajena o alterada. No se continúa.")
                continue
            if exists is None:
                session.execute(
                    text(
                        """
                        INSERT INTO quotes (
                            id, tenant_id, number, source, external_id, issued_on, valid_until, service,
                            origin_place, destination_place, currency, status, version, conditions,
                            observations, created_by
                        )
                        VALUES (
                            :id, :tenant, :number, 'qa_synthetic', :external, :issued, :valid, :service,
                            :origin, :destination, 'COP', :status, 1, :conditions, :observations, :user
                        )
                        """
                    ),
                    {
                        "id": quote.quote_id,
                        "tenant": quote.tenant_id,
                        "number": quote.number,
                        "external": quote.external_id,
                        "issued": quote.issued_on,
                        "valid": quote.valid_until,
                        "service": quote.service,
                        "origin": quote.origin_place,
                        "destination": quote.destination_place,
                        "status": quote.status,
                        "conditions": QUOTE_NOTE,
                        "observations": QUOTE_NOTE,
                        "user": user_id,
                    },
                )
                for line in quote.lines:
                    session.execute(
                        text(
                            """
                            INSERT INTO quote_lines (
                                id, quote_id, tenant_id, position, concept, quantity, unit, unit_amount
                            )
                            VALUES (:id, :quote, :tenant, :position, :concept, :quantity, :unit, :amount)
                            """
                        ),
                        {
                            "id": line.line_id,
                            "quote": quote.quote_id,
                            "tenant": quote.tenant_id,
                            "position": line.position,
                            "concept": line.concept,
                            "quantity": line.quantity,
                            "unit": line.unit,
                            "amount": line.unit_amount,
                        },
                    )
            session.execute(
                text(
                    """
                    INSERT INTO qa_seed_records (batch, entity, entity_id, tenant_id)
                    VALUES (:batch, 'quote', :id, :tenant)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"batch": BATCH, "id": quote.quote_id, "tenant": quote.tenant_id},
            )
    _print(f"Lote {BATCH} aplicado. Identificadores estables del catálogo QA.")


def _rollback(session: Session, user_id: UUID) -> list[str]:
    """Remove seeded database rows first. Storage is deleted only after commit succeeds.

    Keep the batch ledger until Storage confirms deletion, allowing safe retries.
    """
    if not _tables_ready(session):
        raise QaGuardError("No existe el libro del lote. No hay nada que retirar.")
    tenants = _visible_tenants(session, user_id)
    assert_qa_only(tenants)
    all_paths: list[str] = []
    allowed_paths = {doc.storage_path for doc in DOCUMENTS}
    for tenant_id in (CAPACITY_ACCOUNT.tenant_id, CLM_ACCOUNT.tenant_id):
        with session.begin_nested():
            _role(session, user_id, tenant_id)
            paths = session.execute(
                text(
                    """
                    SELECT storage_path FROM qa_seed_records
                    WHERE batch = :batch AND tenant_id = :tenant AND storage_path IS NOT NULL
                    """
                ),
                {"batch": BATCH, "tenant": tenant_id},
            ).scalars().all()
            if any(path not in allowed_paths for path in paths):
                raise QaGuardError(
                    "El libro QA contiene rutas de Storage no reconocidas. Reversión detenida."
                )
            all_paths.extend(path for path in paths if path)
            session.execute(
                text(
                    """
                    DELETE FROM quotes
                    WHERE id IN(
                        SELECT entity_id FROM qa_seed_records
                        WHERE batch = :batch AND tenant_id = :tenant AND entity = 'quote'
                    )
                    """
                ),
                {"batch": BATCH, "tenant": tenant_id},
            )
            session.execute(
                text(
                    """
                    DELETE FROM client_documents
                    WHERE id IN (
                        SELECT entity_id FROM qa_seed_records
                        WHERE batch = :batch AND tenant_id = :tenant AND entity = 'client_document'
                    )
                    """
                ),
                {"batch": BATCH, "tenant": tenant_id},
            )
            session.execute(
                text(
                    """
                    DELETE FROM client_accounts
                    WHERE id IN (
                        SELECT entity_id FROM qa_seed_records
                        WHERE batch = :batch AND tenant_id = :tenant AND entity = 'client_account'
                    )
                    """
                ),
                {"batch": BATCH, "tenant": tenant_id},
            )
    return all_paths


def _finish_rollback(session: Session, user_id: UUID) -> None:
    """Clear ledger only after both database commit and Storage deletion succeeded."""
    _confirm_staff(session, user_id)
    for tenant_id in (CAPACITY_ACCOUNT.tenant_id, CLM_ACCOUNT.tenant_id):
        _role(session, user_id, tenant_id)
        session.execute(
            text("DELETE FROM qa_seed_records WHERE batch = :batch AND tenant_id = :tenant"),
            {"batch": BATCH, "tenant": tenant_id},
        )


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(
        description="Simula, aplica o retira el lote QA de documentos y cotizaciones."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    if not settings.qa_synthetic_enabled:
        _print("QA_SYNTHETIC_ENABLED está apagado. No se continúa.")
        return 2
    storage = build_storage(settings)
    engine = create_db_engine(settings)
    rollback_paths: list[str] | None = None
    uploaded_paths: list[str] = []
    try:
        with Session(engine) as session:
            with session.begin():
                _role(session, STAFF_USER, None)
                flag = session.execute(text("SELECT portal_qa_synthetic_enabled()")).scalar()
                if flag is not True:
                    raise QaGuardError("La base no tiene activa la bandera de QA sintético.")
                _confirm_staff(session, STAFF_USER)
                user_id = STAFF_USER
                if args.apply or args.rollback:
                    if storage is None:
                        raise QaGuardError(
                            "Falta la clave de Storage en el backend. "
                            "No se escribe sin poder guardar o borrar archivos."
                        )
                    if args.apply:
                        _apply(session, user_id, storage, uploaded_paths)
                    else:
                        rollback_paths = _rollback(session, user_id)
                else:
                    _simulate(session, user_id)
                    ready = _tables_ready(session)
                    _print(f"Migración de cotizaciones presente: {'sí' if ready else 'no'}.")
                    _print(f"Storage configurado en el backend: {'sí' if storage is not None else 'no'}.")
        # The DB transaction has committed successfully. Only now remove Storage objects.
        # If deletion fails, keep the batch ledger for a later --rollback retry.
        if rollback_paths is not None:
            if rollback_paths:
                assert storage is not None
                storage.delete(rollback_paths)
            with Session(engine) as session:
                with session.begin():
                    _finish_rollback(session, STAFF_USER)
            _print(f"Lote {BATCH} retirado. Operaciones y solicitudes no se modificaron.")
    except Exception as exc:
        # Database rollback occurs when the transaction context exits. Compensate
        # only Storage objects uploaded during this invocation, never existing files.
        if storage is not None:
            for path in uploaded_paths:
                try:
                    storage.delete([path])
                except Exception:  # noqa: BLE001 - do not expose provider response or secret
                    _print("No se pudo limpiar un archivo QA recién subido; requiere revisión de Storage.")
        if isinstance(exc, QaGuardError):
            _print(str(exc))
            return 2
        _print(f"El lote se interrumpió ({type(exc).__name__}). Revise logs seguros antes de reintentar.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
