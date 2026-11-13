"""Personal interno (RBAC): acceso por rol, tenants verificados y asignados, aislamiento y auditoría.

Datos sintéticos del fixture. El personal de prueba se crea con la conexión del propietario, igual que el
procedimiento administrativo real. No se crean cuentas de Supabase Auth.
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
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration


def _h(user_id, tenant_header=None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {mint_token(user_id)}"}
    if tenant_header is not None:
        headers["X-Tenant-Id"] = str(tenant_header)
    return headers


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def qa(owner_engine: Engine, seed: Seed) -> uuid.UUID:
    """Personal QA activo con empresa A verificada y asignada, y B asignada pero NO verificada."""
    user = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA Prueba')"),
            {"u": user, "e": f"qa-{user}@interno.test"},
        )
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by) "
                "VALUES (:u, 'qa', true, 'Referencia de autorización de prueba')"
            ),
            {"u": user},
        )
        conn.execute(
            text("UPDATE tenants SET external_tenant_id = 'EXT-A-0001', verified_at = now() WHERE id = :t"),
            {"t": seed.tenant_a},
        )
        for tenant in (seed.tenant_a, seed.tenant_b):
            conn.execute(
                text(
                    "INSERT INTO staff_tenant_grants (user_id, tenant_id, authorized_by, reason) "
                    "VALUES (:u, :t, 'Referencia de prueba', 'Soporte de prueba')"
                ),
                {"u": user, "t": tenant},
            )
    return user


def _db(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_qa_enters_panel_without_selecting_a_company(client, qa, seed) -> None:
    r = client.get("/api/v1/staff/me", headers=_h(qa))
    assert r.status_code == 200
    body = r.json()
    assert body["staff_role"] == "qa" and "operations.read" in body["permissions"]
    # No tiene membresía de tenant: /api/v1/me sigue rechazando, lo que es correcto para personal sin cliente.
    assert client.get("/api/v1/me", headers=_h(qa)).status_code == 403


def test_qa_lists_only_verified_and_assigned_tenants(client, qa, seed) -> None:
    items = client.get("/api/v1/staff/tenants", headers=_h(qa)).json()["items"]
    assert [i["id"] for i in items] == [str(seed.tenant_a)]
    assert items[0]["external_tenant_id"] == "EXT-A-0001"


def test_unverified_tenant_is_denied_even_when_assigned(client, qa, seed) -> None:
    r = client.post("/api/v1/staff/context", json={"tenant_id": str(seed.tenant_b)}, headers=_h(qa))
    assert r.status_code == 403 and r.json()["error"]["code"] == "tenant_not_authorized"
    r = client.get(f"/api/v1/staff/tenants/{seed.tenant_b}/operations", headers=_h(qa))
    assert r.status_code == 403


def test_context_selection_then_operations_of_selected_tenant_only(client, qa, seed) -> None:
    assert (
        client.post(
            "/api/v1/staff/context", json={"tenant_id": str(seed.tenant_a)}, headers=_h(qa)
        ).status_code
        == 200
    )
    ops = client.get(f"/api/v1/staff/tenants/{seed.tenant_a}/operations", headers=_h(qa)).json()["items"]
    ids = {o["id"] for o in ops}
    assert ids == {str(seed.op_a), str(seed.op_a2)}
    assert all(o["tenant_id"] == str(seed.tenant_a) for o in ops)
    assert str(seed.op_b) not in ids


def test_forged_tenant_header_does_not_change_the_scope(client, qa, seed) -> None:
    """La ruta decide el tenant. Un encabezado X-Tenant-Id no puede ampliar ni cambiar el alcance."""
    ops = client.get(
        f"/api/v1/staff/tenants/{seed.tenant_a}/operations", headers=_h(qa, tenant_header=seed.tenant_b)
    ).json()["items"]
    assert {o["tenant_id"] for o in ops} == {str(seed.tenant_a)}


def test_external_client_cannot_enter_the_staff_panel(client, seed) -> None:
    r = client.get("/api/v1/staff/me", headers=_h(seed.ana))
    assert r.status_code == 403 and r.json()["error"]["code"] == "no_staff_role"
    assert client.get("/api/v1/staff/tenants", headers=_h(seed.ana)).status_code == 403


def test_user_without_any_role_is_denied(client, seed) -> None:
    assert client.get("/api/v1/staff/me", headers=_h(seed.eva)).status_code == 403


def test_client_member_of_other_tenant_cannot_read_operations_through_staff(client, seed) -> None:
    r = client.get(f"/api/v1/staff/tenants/{seed.tenant_b}/operations", headers=_h(seed.ana))
    assert r.status_code == 403 and r.json()["error"]["code"] == "no_staff_role"


def test_revocation_takes_effect_on_the_next_request(client, qa, owner_engine, seed) -> None:
    assert client.get("/api/v1/staff/me", headers=_h(qa)).status_code == 200
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE platform_staff SET active = false, revoked_at = now(), revoked_reason = 'Prueba' "
                "WHERE user_id = :u"
            ),
            {"u": qa},
        )
    r = client.get("/api/v1/staff/me", headers=_h(qa))
    assert r.status_code == 403 and r.json()["error"]["code"] == "no_staff_role"


def test_sensitive_actions_are_audited_including_denials(client, qa, owner_engine, seed) -> None:
    client.get("/api/v1/staff/tenants", headers=_h(qa))
    client.post("/api/v1/staff/context", json={"tenant_id": str(seed.tenant_b)}, headers=_h(qa))
    client.post("/api/v1/staff/context", json={"tenant_id": str(seed.tenant_a)}, headers=_h(qa))
    client.get(f"/api/v1/staff/tenants/{seed.tenant_a}/operations", headers=_h(qa))
    rows = _db(owner_engine, "SELECT action, result FROM staff_access_audit WHERE actor_id = :u", u=qa)
    actions = {(r["action"], r["result"]) for r in rows}
    assert ("tenants_list", "allowed") in actions
    assert ("context_denied", "denied") in actions
    assert ("context_select", "allowed") in actions
    assert ("operations_list", "allowed") in actions


def test_portal_role_sees_no_operations_without_a_selected_tenant(owner_engine, qa, seed) -> None:
    """RLS: sin tenant fijado por FastAPI, el personal no ve ninguna operación aunque tenga asignación."""
    with owner_engine.begin() as conn:
        conn.execute(text("SET LOCAL ROLE portal_app"))
        conn.execute(text("SELECT set_config('app.current_user_id', :u, true)"), {"u": str(qa)})
        assert conn.execute(text("SELECT count(*) FROM operation_refs")).scalar() == 0
        assert conn.execute(text("SELECT count(*) FROM tenants")).scalar() == 1


def test_staff_cannot_create_or_change_tenants_through_the_portal(owner_engine, qa, seed) -> None:
    from sqlalchemy.exc import DBAPIError

    with owner_engine.begin() as conn:
        conn.execute(text("SET LOCAL ROLE portal_app"))
        conn.execute(text("SELECT set_config('app.current_user_id', :u, true)"), {"u": str(qa)})
        with pytest.raises(DBAPIError) as info:
            conn.execute(text("UPDATE tenants SET status = 'suspended'"))
        assert info.value.orig.sqlstate == "42501"
