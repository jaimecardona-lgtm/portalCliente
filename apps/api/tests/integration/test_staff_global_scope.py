"""Alcance global verificado para personal interno: descubrimiento, contexto, auditoría y revocación.

Datos sintéticos del fixture. El alcance se concede y revoca con el procedimiento administrativo
(`staff_provisioning`), igual que en producción. No se crean cuentas de Supabase Auth.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.main import create_app
from app.services.staff_provisioning import Authorization, ProvisioningError, grant_scope, revoke_scope
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration

REASON = "Soporte de prueba del alcance global"


def _h(user_id) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user_id)}"}


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def qa_global(owner_engine: Engine, seed: Seed) -> uuid.UUID:
    """QA activo SIN grants por empresa, con ambas empresas verificadas y alcance global concedido."""
    user = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA Global Prueba')"),
            {"u": user, "e": f"qa-global-{user}@interno.test"},
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
        conn.execute(
            text("UPDATE tenants SET external_tenant_id = 'EXT-B-0001', verified_at = now() WHERE id = :t"),
            {"t": seed.tenant_b},
        )
        grant_scope(conn, user, Authorization("Autorización expresa de prueba", REASON))
    return user


def _db(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_global_scope_discovers_all_verified_tenants_without_grants(client, qa_global, seed) -> None:
    r = client.get("/api/v1/staff/tenants", headers=_h(qa_global))
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert {str(seed.tenant_a), str(seed.tenant_b)} <= ids


def test_unverified_tenant_stays_invisible_even_with_global_scope(
    client, qa_global, seed, owner_engine
) -> None:
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE tenants SET verified_at = NULL, external_tenant_id = NULL WHERE id = :t"),
            {"t": seed.tenant_b},
        )
    r = client.get("/api/v1/staff/tenants", headers=_h(qa_global))
    assert str(seed.tenant_b) not in {item["id"] for item in r.json()["items"]}
    denied = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_b), "reason": REASON},
        headers=_h(qa_global),
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "tenant_not_authorized"


def test_switching_between_tenants_audits_previous_new_reason_and_one_context_per_request(
    client, qa_global, seed, owner_engine
) -> None:
    first = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_a), "reason": REASON},
        headers=_h(qa_global),
    )
    assert first.status_code == 200
    second = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_b), "reason": REASON},
        headers=_h(qa_global),
    )
    assert second.status_code == 200
    rows = _db(
        owner_engine,
        "SELECT tenant_id, previous_tenant_id, reason FROM staff_access_audit "
        "WHERE actor_id = :a AND action = 'context_select' ORDER BY created_at, id",
        a=qa_global,
    )
    assert [
        (str(r["tenant_id"]), str(r["previous_tenant_id"]) if r["previous_tenant_id"] else None) for r in rows
    ] == [
        (str(seed.tenant_a), None),
        (str(seed.tenant_b), str(seed.tenant_a)),
    ]
    assert all(r["reason"] == REASON for r in rows)


def test_context_requires_a_support_reason(client, qa_global, seed) -> None:
    r = client.post("/api/v1/staff/context", json={"tenant_id": str(seed.tenant_a)}, headers=_h(qa_global))
    assert r.status_code == 422


def test_operations_of_selected_tenant_are_only_the_selected_ones(client, qa_global, seed) -> None:
    r = client.get(f"/api/v1/staff/tenants/{seed.tenant_b}/operations", headers=_h(qa_global))
    assert r.status_code == 200
    assert {item["tenant_id"] for item in r.json()["items"]} <= {str(seed.tenant_b)}


def test_revoking_global_scope_keeps_only_explicit_grants(client, qa_global, seed, owner_engine) -> None:
    with owner_engine.begin() as conn:
        revoke_scope(conn, qa_global, "Revocación de prueba")
    assert client.get("/api/v1/staff/tenants", headers=_h(qa_global)).json()["items"] == []
    denied = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_a), "reason": REASON},
        headers=_h(qa_global),
    )
    assert denied.status_code == 403


def test_global_scope_requires_authorization_and_an_active_staff_role(owner_engine, seed) -> None:
    stranger = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'Sin rol de prueba')"),
            {"u": stranger, "e": f"sin-rol-{stranger}@interno.test"},
        )
    with owner_engine.begin() as conn:
        with pytest.raises(ProvisioningError):
            grant_scope(conn, stranger, Authorization("Autorización de prueba", REASON))
    # Un alcance global sin referencia de autorización lo rechaza la restricción de la tabla (y revierte).
    with pytest.raises(IntegrityError), owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by, tenant_scope) "
                "VALUES (:u, 'qa', true, 'Referencia de prueba', 'all_verified_support_tenants')"
            ),
            {"u": stranger},
        )
