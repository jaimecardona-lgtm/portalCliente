"""Catálogo de empresas observadas: solo personal con permiso, sin identificadores externos ni operaciones.

No modifica el catálogo compartido: compara la respuesta con lo que la tabla contiene.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.main import create_app
from app.services.staff_provisioning import Authorization, grant_scope
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


def _h(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user)}"}


def test_staff_sees_observed_catalog_without_official_ids(client, owner_engine, seed) -> None:
    qa = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA catálogo')"),
            {"u": qa, "e": f"qa-cat-{qa}@interno.test"},
        )
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by) "
                "VALUES (:u, 'qa', true, 'Referencia de prueba')"
            ),
            {"u": qa},
        )
        grant_scope(conn, qa, Authorization("Autorización de prueba", "Catálogo de prueba"))
    r = client.get("/api/v1/staff/observed-tenants", headers=_h(qa))
    assert r.status_code == 200
    items = r.json()["items"]
    with owner_engine.connect() as conn:
        expected = conn.execute(text("SELECT count(*) FROM logixtic_tenant_discovery")).scalar_one()
    assert len(items) == expected
    assert all(i["has_official_id"] is False for i in items)
    assert all(i["integration_status"] == "no_vinculada" for i in items)
    assert all(i["verification_status"] == "unverified" for i in items)
    assert "external_tenant_id" not in items[0]


def test_client_cannot_read_the_observed_catalog(client, seed) -> None:
    r = client.get("/api/v1/staff/observed-tenants", headers=_h(seed.ana))
    assert r.status_code in (401, 403)
