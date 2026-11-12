"""Reconciliación administrativa de la cola de limpieza de Storage (app.services.storage_reconcile).

Usa la conexión del propietario (como en producción) y un almacenamiento falso. Datos sintéticos del fixture.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.services.storage import StorageError
from app.services.storage_reconcile import decide, reconcile, sanitize_error
from tests.conftest import Seed
from tests.fakes import FakeObjectStorage

pytestmark = pytest.mark.integration

SHA = "a" * 64


def _path(seed: Seed, name: str) -> str:
    doc = uuid.uuid4()
    base = f"tenants/{seed.tenant_a}/clients/{seed.client_a1}"
    return f"{base}/operations/{seed.op_a}/documents/{doc}/{name}.pdf"


def _job(engine: Engine, seed: Seed, path: str, attempts: int = 0) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO storage_cleanup_jobs (tenant_id, storage_path, reason, attempts) "
                "VALUES (:t, :p, 'replaced', :a)"
            ),
            {"t": seed.tenant_a, "p": path, "a": attempts},
        )


def _job_row(engine: Engine, path: str):
    with engine.connect() as conn:
        return (
            conn.execute(
                text(
                    "SELECT status, attempts, last_error, completed_at "
                    "FROM storage_cleanup_jobs WHERE storage_path = :p"
                ),
                {"p": path},
            )
            .mappings()
            .one()
        )


def _referenced_document(engine: Engine, seed: Seed, path: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO client_documents (tenant_id, client_account_id, operation_id, file_name,
                    mime_type,
                    size_bytes, sha256, storage_path, version, status, uploaded_by)
                VALUES (:t, :c, :o, 'vigente.pdf', 'application/pdf', 10, :sha, :p, 1, 'available', :u)
                """
            ),
            {"t": seed.tenant_a, "c": seed.client_a1, "o": seed.op_a, "sha": SHA, "p": path, "u": seed.ana},
        )


def test_pure_decision_never_deletes_a_referenced_path() -> None:
    assert decide("p", referenced=True) == "skip_referenced"
    assert decide("p", referenced=False) == "delete"


def test_storage_errors_are_sanitized() -> None:
    assert sanitize_error(StorageError("borrado", 500)) == "storage:borrado:500"
    assert sanitize_error(StorageError("firma")) == "storage:firma:sin_respuesta"


def test_dry_run_changes_nothing(owner_engine: Engine, seed: Seed) -> None:
    storage = FakeObjectStorage()
    path = _path(seed, "simulado")
    storage.objects[path] = b"x"
    _job(owner_engine, seed, path)
    report = reconcile(owner_engine, storage, apply=False)
    assert report.dry_run and report.examined == 1 and report.deleted == 0
    assert path in storage.objects
    assert _job_row(owner_engine, path)["status"] == "pending"


def test_apply_deletes_unreferenced_objects_and_marks_done(owner_engine: Engine, seed: Seed) -> None:
    storage = FakeObjectStorage()
    path = _path(seed, "huerfano")
    storage.objects[path] = b"x"
    _job(owner_engine, seed, path)
    report = reconcile(owner_engine, storage, apply=True)
    assert report.deleted == 1
    assert path not in storage.objects
    row = _job_row(owner_engine, path)
    assert row["status"] == "done" and row["completed_at"] is not None


def test_object_that_became_a_valid_reference_is_never_deleted(owner_engine: Engine, seed: Seed) -> None:
    storage = FakeObjectStorage()
    path = _path(seed, "vigente")
    storage.objects[path] = b"x"
    _referenced_document(owner_engine, seed, path)
    _job(owner_engine, seed, path)
    report = reconcile(owner_engine, storage, apply=True)
    assert report.skipped_referenced == 1 and report.deleted == 0
    assert path in storage.objects
    assert _job_row(owner_engine, path)["status"] == "done"


def test_storage_failure_is_recorded_and_retryable(owner_engine: Engine, seed: Seed) -> None:
    storage = FakeObjectStorage()
    path = _path(seed, "reintento")
    storage.objects[path] = b"x"
    storage.fail_delete = True
    _job(owner_engine, seed, path)
    report = reconcile(owner_engine, storage, apply=True)
    assert report.failed == 1
    row = _job_row(owner_engine, path)
    assert row["status"] == "pending" and row["attempts"] == 1 and row["last_error"] == "storage:borrado:500"
    assert row["completed_at"] is None


def test_job_is_marked_failed_after_max_attempts(owner_engine: Engine, seed: Seed) -> None:
    storage = FakeObjectStorage()
    path = _path(seed, "agotado")
    storage.fail_delete = True
    _job(owner_engine, seed, path, attempts=4)
    reconcile(owner_engine, storage, apply=True, max_attempts=5)
    assert _job_row(owner_engine, path)["status"] == "failed"
