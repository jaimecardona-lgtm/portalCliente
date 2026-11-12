"""Documentos de operación: subida, lectura, enlaces firmados, reemplazo, retirada y compensaciones.

Usa PostgreSQL con RLS (rol portal_app) y un almacenamiento falso en memoria.
Los datos son sintéticos del fixture.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.main import create_app
from tests.conftest import Seed, mint_token
from tests.fakes import FakeObjectStorage

pytestmark = pytest.mark.integration

PDF = b"%PDF-1.7\nsintetico\n%%EOF"
PDF_MIME = "application/pdf"


def _h(user_id) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user_id)}"}


def _upload(
    client: TestClient,
    user_id,
    operation_id,
    data: bytes = PDF,
    name: str = "contrato.pdf",
    mime: str = PDF_MIME,
):
    return client.post(
        f"/api/v1/operations/{operation_id}/documents",
        content=data,
        headers={**_h(user_id), "Content-Type": mime, "X-File-Name": name},
    )


def _replace(client: TestClient, user_id, document_id, data: bytes = PDF, name: str = "contrato-v2.pdf"):
    return client.put(
        f"/api/v1/documents/{document_id}/file",
        content=data,
        headers={**_h(user_id), "Content-Type": PDF_MIME, "X-File-Name": name},
    )


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture
def docs_app(
    test_settings: Settings, owner_engine: Engine, seed: Seed, storage: FakeObjectStorage
) -> FastAPI:
    return create_app(test_settings, database_engine=owner_engine, object_storage=storage)


@pytest.fixture
def docs_client(docs_app: FastAPI) -> TestClient:
    with TestClient(docs_app) as c:
        yield c


def _db(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_admin_uploads_real_object_and_persists_reference(docs_client, storage, owner_engine, seed) -> None:
    r = _upload(docs_client, seed.ana, seed.op_a)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["version"] == 1 and doc["status"] == "available"
    row = _db(
        owner_engine,
        "SELECT storage_path, status, sha256, size_bytes FROM client_documents WHERE id = :id",
        id=doc["id"],
    )[0]
    assert row["status"] == "available"
    assert row["storage_path"] in storage.objects
    assert row["storage_path"].startswith(
        f"tenants/{seed.tenant_a}/clients/{seed.client_a1}/operations/{seed.op_a}/documents/{doc['id']}/"
    )
    assert "contrato" not in row["storage_path"]  # el nombre del archivo nunca forma parte de la ruta


def test_client_viewer_reads_but_cannot_write(docs_client, storage, seed) -> None:
    assert _upload(docs_client, seed.ana, seed.op_a).status_code == 201
    listed = docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.beto))
    assert listed.status_code == 200 and len(listed.json()["items"]) == 1
    denied = _upload(docs_client, seed.beto, seed.op_a)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "role_cannot_manage_documents"


def test_other_tenant_and_other_client_get_not_found(docs_client, storage, seed) -> None:
    created = _upload(docs_client, seed.ana, seed.op_a).json()
    # carla es de la empresa B y administra B1: no ve operaciones de A1 ni de A2.
    assert (
        docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.carla)).status_code
        == 404
    )
    assert _upload(docs_client, seed.carla, seed.op_a).status_code == 404
    assert (
        docs_client.get(f"/api/v1/documents/{created['id']}/link", headers=_h(seed.carla)).status_code == 404
    )
    # dora pertenece a A y a B, pero no tiene acceso a A1 ni A2: pertenecer a la empresa no basta.
    # Con dos empresas debe elegir una con X-Tenant-Id; sin la cabecera la API responde 400.
    dora_a = {**_h(seed.dora), "X-Tenant-Id": str(seed.tenant_a)}
    assert docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=dora_a).status_code == 404
    assert docs_client.get(f"/api/v1/operations/{seed.op_a2}/documents", headers=dora_a).status_code == 404
    assert docs_client.get(f"/api/v1/documents/{created['id']}/link", headers=dora_a).status_code == 404
    assert (
        docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.dora)).status_code == 400
    )


def test_operation_of_other_client_in_same_tenant_is_invisible(docs_client, storage, seed) -> None:
    assert (
        docs_client.get(f"/api/v1/operations/{seed.op_a2}/documents", headers=_h(seed.ana)).status_code == 404
    )


def test_without_session_access_is_denied(docs_client, seed) -> None:
    assert docs_client.get(f"/api/v1/operations/{seed.op_a}/documents").status_code == 401


def test_signed_link_is_temporary_and_not_stored(docs_client, storage, owner_engine, seed) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    link = docs_client.get(f"/api/v1/documents/{doc['id']}/link", headers=_h(seed.beto))
    assert link.status_code == 200
    body = link.json()
    assert "token=" in body["url"] and body["expires_in_seconds"] == 300
    stored = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0]
    assert "token" not in stored["storage_path"] and "http" not in stored["storage_path"]


@pytest.mark.parametrize(
    "data,mime,name,status,code",
    [
        (b"", PDF_MIME, "a.pdf", 422, "file_empty"),
        (b"no es pdf", PDF_MIME, "a.pdf", 415, "content_mismatch"),
        (PDF, "text/html", "a.html", 415, "unsupported_type"),
        (PDF, PDF_MIME, "a.exe", 415, "extension_mismatch"),
        (b"%PDF-" + b"0" * (5 * 1024 * 1024), PDF_MIME, "grande.pdf", 413, "file_too_large"),
    ],
)
def test_invalid_uploads_are_rejected_and_nothing_is_stored(
    docs_client, storage, seed, data, mime, name, status, code
) -> None:
    r = _upload(docs_client, seed.ana, seed.op_a, data=data, name=name, mime=mime)
    assert (r.status_code, r.json()["error"]["code"]) == (status, code)
    assert storage.objects == {}


def test_replacement_publishes_new_version_and_removes_previous_object(
    docs_client, storage, owner_engine, seed
) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    old_path = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0][
        "storage_path"
    ]
    r = _replace(docs_client, seed.ana, doc["id"], data=PDF + b"v2")
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2 and r.json()["previous_object_cleanup"] == "done"
    new_path = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0][
        "storage_path"
    ]
    assert new_path != old_path and new_path in storage.objects
    assert old_path not in storage.objects and old_path in storage.deleted
    events = _db(
        owner_engine,
        "SELECT action FROM client_document_events WHERE document_id = :id ORDER BY created_at",
        id=doc["id"],
    )
    assert [e["action"] for e in events] == ["uploaded", "replaced"]


def test_failed_previous_object_cleanup_is_recorded_for_retry(
    docs_client, storage, owner_engine, seed
) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    old_path = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0][
        "storage_path"
    ]
    storage.fail_delete = True
    r = _replace(docs_client, seed.ana, doc["id"])
    assert r.status_code == 200 and r.json()["previous_object_cleanup"] == "pending"
    job = _db(
        owner_engine,
        "SELECT status, reason, attempts FROM storage_cleanup_jobs WHERE storage_path = :p",
        p=old_path,
    )
    assert len(job) == 1 and job[0]["status"] == "pending" and job[0]["reason"] == "replaced"


def test_failed_upload_during_replacement_keeps_current_version(
    docs_client, storage, owner_engine, seed
) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    before = _db(
        owner_engine, "SELECT storage_path, version FROM client_documents WHERE id = :id", id=doc["id"]
    )[0]
    storage.fail_upload = True
    r = _replace(docs_client, seed.ana, doc["id"])
    assert r.status_code == 502 and r.json()["error"]["code"] == "storage_unavailable"
    after = _db(
        owner_engine, "SELECT storage_path, version FROM client_documents WHERE id = :id", id=doc["id"]
    )[0]
    assert after["storage_path"] == before["storage_path"] and after["version"] == 1
    assert before["storage_path"] in storage.objects


def test_database_failure_after_upload_removes_orphan_object(
    docs_client, storage, owner_engine, seed, monkeypatch
) -> None:
    from app.services import documents as svc

    def boom(*args, **kwargs):
        raise RuntimeError("fallo simulado de escritura")

    monkeypatch.setattr(svc, "_event", boom)
    r = _upload(docs_client, seed.ana, seed.op_a)
    assert r.status_code == 503 and r.json()["error"]["code"] == "persistence_failed"
    assert storage.objects == {}  # el objeto subido no queda huérfano
    assert (
        _db(
            owner_engine, "SELECT count(*) AS n FROM client_documents WHERE operation_id = :op", op=seed.op_a
        )[0]["n"]
        == 0
    )


def test_removal_hides_document_and_deletes_object(docs_client, storage, owner_engine, seed) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    path = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0][
        "storage_path"
    ]
    r = docs_client.delete(f"/api/v1/documents/{doc['id']}", headers=_h(seed.ana))
    assert r.status_code == 200 and r.json() == {
        "id": doc["id"],
        "status": "removed",
        "storage_cleanup": "done",
    }
    assert path not in storage.objects
    listed = docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.beto)).json()[
        "items"
    ]
    assert listed == []
    assert docs_client.get(f"/api/v1/documents/{doc['id']}/link", headers=_h(seed.beto)).status_code == 404
    row = _db(
        owner_engine,
        "SELECT status, storage_path, removed_at FROM client_documents WHERE id = :id",
        id=doc["id"],
    )[0]
    assert row["status"] == "removed" and row["storage_path"] is None and row["removed_at"] is not None
    actions = [
        e["action"]
        for e in _db(
            owner_engine, "SELECT action FROM client_document_events WHERE document_id = :id", id=doc["id"]
        )
    ]
    assert "removed" in actions


def test_failed_removal_leaves_cleanup_job(docs_client, storage, owner_engine, seed) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    path = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0][
        "storage_path"
    ]
    storage.fail_delete = True
    r = docs_client.delete(f"/api/v1/documents/{doc['id']}", headers=_h(seed.ana))
    assert r.status_code == 200 and r.json()["storage_cleanup"] == "pending"
    job = _db(owner_engine, "SELECT status, reason FROM storage_cleanup_jobs WHERE storage_path = :p", p=path)
    assert len(job) == 1 and job[0]["status"] == "pending" and job[0]["reason"] == "removed"


def test_clients_cannot_manage_other_client_documents(docs_client, storage, seed) -> None:
    doc = _upload(docs_client, seed.ana, seed.op_a).json()
    # carla es admin de B1; no puede reemplazar ni retirar un documento de A1.
    assert _replace(docs_client, seed.carla, doc["id"]).status_code == 404
    assert docs_client.delete(f"/api/v1/documents/{doc['id']}", headers=_h(seed.carla)).status_code == 404


def test_without_storage_configuration_routes_answer_503(test_settings, owner_engine, seed) -> None:
    app = create_app(test_settings, database_engine=owner_engine)  # sin clave de Storage: no hay adaptador
    with TestClient(app) as c:
        r = c.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.ana))
    assert r.status_code == 503 and r.json()["error"]["code"] == "storage_not_configured"
