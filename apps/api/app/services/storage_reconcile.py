"""Procesamiento administrativo reintentable de la cola `storage_cleanup_jobs`.

Responsabilidad: borrar objetos de Storage que quedaron sin referencia válida (reemplazos, retiradas, subidas
fallidas) y registrar el resultado. Se ejecuta con la conexión del PROPIETARIO del esquema,
nunca con `portal_api`,
porque el portal no puede leer la cola.

Reglas de seguridad:
- Antes de borrar, se comprueba que la ruta NO sea la referencia de ningún documento
  (`client_documents`), en cualquier estado. Un objeto que volvió a ser referencia válida nunca se borra.
- Modo por defecto: simulación. Solo borra con `apply=True`.
- Los errores se guardan sanitizados (código de operación y HTTP), sin respuesta del proveedor
  ni datos de conexión.
- Tras `max_attempts` fallos el trabajo pasa a `failed` y queda para revisión manual.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.services.storage import ObjectStorage, StorageError

DEFAULT_MAX_ATTEMPTS = 5


@dataclass
class ReconcileReport:
    examined: int = 0
    deleted: int = 0
    skipped_referenced: int = 0
    failed: int = 0
    dry_run: bool = True
    details: list[dict[str, Any]] = field(default_factory=list)


def decide(path: str, referenced: bool) -> str:
    """Decisión pura para un trabajo: 'skip_referenced' o 'delete'."""
    return "skip_referenced" if referenced else "delete"


def sanitize_error(exc: StorageError) -> str:
    """Error seguro para guardar: operación y código HTTP. Nunca el mensaje del proveedor."""
    return f"storage:{exc.operation}:{exc.status if exc.status is not None else 'sin_respuesta'}"[:200]


def reconcile(
    engine: Engine,
    storage: ObjectStorage,
    *,
    apply: bool = False,
    limit: int = 100,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> ReconcileReport:
    report = ReconcileReport(dry_run=not apply)
    with engine.begin() as conn:
        jobs = (
            conn.execute(
                text(
                    """
                SELECT id, storage_path, reason, attempts FROM storage_cleanup_jobs
                WHERE status = 'pending' ORDER BY created_at, id LIMIT :limit
                """
                ),
                {"limit": limit},
            )
            .mappings()
            .all()
        )

    for job in jobs:
        report.examined += 1
        with engine.connect() as conn:
            referenced = conn.execute(
                text("SELECT EXISTS (SELECT 1 FROM client_documents WHERE storage_path = :p)"),
                {"p": job["storage_path"]},
            ).scalar()
        action = decide(job["storage_path"], bool(referenced))
        entry = {"job_id": str(job["id"]), "reason": job["reason"], "action": action}

        if action == "skip_referenced":
            report.skipped_referenced += 1
            if apply:
                _update(engine, job["id"], "done", None, job["attempts"], completed=True)
            report.details.append(entry)
            continue

        if not apply:
            report.details.append(entry)
            continue

        try:
            storage.delete([job["storage_path"]])
        except StorageError as exc:
            attempts = int(job["attempts"]) + 1
            status = "failed" if attempts >= max_attempts else "pending"
            _update(engine, job["id"], status, sanitize_error(exc), attempts, completed=False)
            report.failed += 1
            entry["error"] = sanitize_error(exc)
            report.details.append(entry)
            continue

        _update(engine, job["id"], "done", None, int(job["attempts"]) + 1, completed=True)
        report.deleted += 1
        report.details.append(entry)
    return report


def _update(
    engine: Engine, job_id: Any, status: str, error: str | None, attempts: int, *, completed: bool
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE storage_cleanup_jobs
                SET status = :status, last_error = :error, attempts = :attempts, updated_at = now(),
                    completed_at = CASE WHEN :completed THEN now() ELSE NULL END
                WHERE id = :id
                """
            ),
            {"status": status, "error": error, "attempts": attempts, "id": job_id, "completed": completed},
        )
