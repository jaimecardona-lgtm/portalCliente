"""Personal con alcance global: operaciones y eventos de la empresa seleccionada; nunca internos."""

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


def _h(user, tenant=None) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user)}"}


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def qa(owner_engine: Engine, seed: Seed) -> uuid.UUID:
    user = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA Ops Prueba')"),
            {"u": user, "e": f"qa-ops-{user}@interno.test"},
        )
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by) "
                "VALUES (:u, 'qa', true, 'Referencia de prueba')"
            ),
            {"u": user},
        )
        for t, ext in ((seed.tenant_a, "EXT-A-OPS"), (seed.tenant_b, "EXT-B-OPS")):
            conn.execute(
                text("UPDATE tenants SET external_tenant_id = :x, verified_at = now() WHERE id = :t"),
                {"x": ext, "t": t},
            )
        grant_scope(conn, user, Authorization("Autorización de prueba", "Prueba de operaciones y eventos"))
    return user


def test_operations_are_scoped_to_the_selected_tenant_and_expose_display_fields(client, qa, seed) -> None:
    r = client.get(f"/api/v1/staff/tenants/{seed.tenant_a}/operations", headers=_h(qa))
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(i["tenant_id"] == str(seed.tenant_a) for i in items)
    assert {"origin_name", "eta", "pending_client_response"} <= set(items[0])


def test_events_exclude_internal_and_never_cross_tenants(client, qa, seed) -> None:
    ok = client.get(f"/api/v1/staff/tenants/{seed.tenant_a}/operations/{seed.op_a}/events", headers=_h(qa))
    assert ok.status_code == 200
    ids = {e["id"] for e in ok.json()["items"]}
    assert str(seed.event_a_public) in ids
    assert str(seed.event_a_internal) not in ids
    cross = client.get(f"/api/v1/staff/tenants/{seed.tenant_b}/operations/{seed.op_a}/events", headers=_h(qa))
    assert cross.status_code == 200 and cross.json()["items"] == []
