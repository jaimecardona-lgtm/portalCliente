"""Documentos generales del cliente final (sin operación asociada). Datos sintéticos del fixture.

Cubre la extensión mínima de la migración 20261112000300: subir documentos del cliente
sin inventar una operación, con la misma autorización por cliente final que los de operación.
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

PDF = b"%PDF-1.7\ngeneral\n%%EOF"
PDF_MIME = "application/pdf"


def _h(user_id, tenant_id=None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {mint_token(user_id)}"}
    if tenant_id is not None:
        headers["X-Tenant-Id"] = str(tenant_id)
    return headers


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture
def docs_client(test_settings: Settings, owner_engine: Engine, seed: Seed, storage: FakeObjectStorage):
    app: FastAPI = create_app(test_settings, database_engine=owner_engine, object_storage=storage)
    with TestClient(app) as c:
        yield c


def _upload(
    client: TestClient, user_id, client_id, name: str = "poder-general.pdf", data: bytes = PDF, tenant=None
):
    return client.post(
        f"/api/v1/client-accounts/{client_id}/documents",
        content=data,
        headers={**_h(user_id, tenant), "Content-Type": PDF_MIME, "X-File-Name": name},
    )


def _db(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_admin_uploads_general_document_without_any_operation(
    docs_client, storage, owner_engine, seed
) -> None:
    r = _upload(docs_client, seed.ana, seed.client_a1)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["operation_id"] is None and doc["client_account_id"] == str(seed.client_a1)
    row = _db(
        owner_engine, "SELECT operation_id, storage_path FROM client_documents WHERE id = :id", id=doc["id"]
    )[0]
    assert row["operation_id"] is None
    assert row["storage_path"] in storage.objects
    assert "/operations/" not in row["storage_path"]
    assert row["storage_path"].startswith(f"tenants/{seed.tenant_a}/clients/{seed.client_a1}/documents/")


def test_general_documents_are_listed_for_the_client_and_not_for_operations(
    docs_client, storage, seed
) -> None:
    _upload(docs_client, seed.ana, seed.client_a1)
    listed = docs_client.get(f"/api/v1/client-accounts/{seed.client_a1}/documents", headers=_h(seed.beto))
    assert listed.status_code == 200 and len(listed.json()["items"]) == 1
    op_list = docs_client.get(f"/api/v1/operations/{seed.op_a}/documents", headers=_h(seed.ana))
    assert op_list.json()["items"] == []


def test_viewer_reads_but_cannot_upload(docs_client, storage, seed) -> None:
    denied = _upload(docs_client, seed.beto, seed.client_a1)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "role_cannot_manage_documents"
    assert storage.objects == {}


def test_other_client_or_tenant_cannot_see_or_upload(docs_client, storage, seed) -> None:
    _upload(docs_client, seed.ana, seed.client_a1)
    # carla administra B1 (otra empresa): no ve ni sube documentos de A1.
    assert (
        docs_client.get(
            f"/api/v1/client-accounts/{seed.client_a1}/documents", headers=_h(seed.carla)
        ).status_code
        == 404
    )
    assert _upload(docs_client, seed.carla, seed.client_a1).status_code == 404
    # dora es miembro de A sin cliente en A1 ni en A2.
    dora_a = _h(seed.dora, seed.tenant_a)
    assert (
        docs_client.get(f"/api/v1/client-accounts/{seed.client_a1}/documents", headers=dora_a).status_code
        == 404
    )
    assert (
        docs_client.get(f"/api/v1/client-accounts/{seed.client_a2}/documents", headers=dora_a).status_code
        == 404
    )


def test_client_access_lists_only_own_memberships_in_the_active_company(docs_client, seed) -> None:
    ana = docs_client.get("/api/v1/client-access", headers=_h(seed.ana)).json()["items"]
    assert [(i["client_account_id"], i["role"], i["can_manage"]) for i in ana] == [
        (str(seed.client_a1), "client_admin", True)
    ]
    beto = docs_client.get("/api/v1/client-access", headers=_h(seed.beto)).json()["items"]
    assert beto[0]["role"] == "client_viewer" and beto[0]["can_manage"] is False
    # dora no tiene cliente en A, aunque sea miembro de A.
    assert (
        docs_client.get("/api/v1/client-access", headers=_h(seed.dora, seed.tenant_a)).json()["items"] == []
    )
    dora_b = docs_client.get("/api/v1/client-access", headers=_h(seed.dora, seed.tenant_b)).json()["items"]
    assert [i["client_account_id"] for i in dora_b] == [str(seed.client_b1)]


def test_general_document_can_be_linked_replaced_and_removed(
    docs_client, storage, owner_engine, seed
) -> None:
    doc = _upload(docs_client, seed.ana, seed.client_a1).json()
    link = docs_client.get(f"/api/v1/documents/{doc['id']}/link", headers=_h(seed.beto))
    assert link.status_code == 200 and "token=" in link.json()["url"]

    replaced = docs_client.put(
        f"/api/v1/documents/{doc['id']}/file",
        content=PDF + b"v2",
        headers={**_h(seed.ana), "Content-Type": PDF_MIME, "X-File-Name": "poder-v2.pdf"},
    )
    assert replaced.status_code == 200 and replaced.json()["version"] == 2
    assert replaced.json()["previous_object_cleanup"] == "done"
    current = _db(owner_engine, "SELECT storage_path FROM client_documents WHERE id = :id", id=doc["id"])[0]
    assert "/operations/" not in current["storage_path"] and current["storage_path"] in storage.objects

    removed = docs_client.delete(f"/api/v1/documents/{doc['id']}", headers=_h(seed.ana))
    assert removed.status_code == 200 and removed.json()["storage_cleanup"] == "done"
    assert (
        docs_client.get(f"/api/v1/client-accounts/{seed.client_a1}/documents", headers=_h(seed.beto)).json()[
            "items"
        ]
        == []
    )


def test_unknown_client_returns_not_found_not_a_leak(docs_client, seed) -> None:
    import uuid

    r = docs_client.get(f"/api/v1/client-accounts/{uuid.uuid4()}/documents", headers=_h(seed.ana))
    assert r.status_code == 404


def test_percent_encoded_file_name_is_stored_decoded(docs_client, storage, owner_engine, seed) -> None:
    from urllib.parse import quote

    name = "Póliza de seguro año 2026.pdf"
    r = _upload(docs_client, seed.ana, seed.client_a1, name=quote(name))
    assert r.status_code == 201, r.text
    assert r.json()["file_name"] == name
