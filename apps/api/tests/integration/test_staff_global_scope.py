"""Alcance global verificado para personal interno: descubrimiento, cambio de empresa con reautenticación,
auditoría y revocación.

Datos sintéticos del fixture. El cambio de empresa exige un desafío y una reautenticación reciente
(claim amr 'password'), que se usa una sola vez y se vincula al desafío.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.main import create_app
from app.services.staff_provisioning import Authorization, ProvisioningError, grant_scope, revoke_scope
from tests.conftest import Seed, mint_token, switch_context

pytestmark = pytest.mark.integration


def _h(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user)}"}


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
        grant_scope(conn, user, Authorization("Autorización de prueba", "Alcance global de prueba"))
    return user


def _db(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_global_scope_discovers_all_verified_tenants_without_grants(client, qa_global, seed) -> None:
    r = client.get("/api/v1/staff/tenants", headers=_h(qa_global))
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert {str(seed.tenant_a), str(seed.tenant_b)} <= ids


def test_unverified_tenant_stays_invisible_and_cannot_be_challenged(
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
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_b)}, headers=_h(qa_global)
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "tenant_not_authorized"


def test_switch_requires_recent_password_reauthentication(client, qa_global, seed) -> None:
    """Sin contraseña reciente el cambio no ocurre; con contraseña reciente sí."""
    headers = _h(qa_global)
    challenge = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_a)}, headers=headers
    )
    assert challenge.status_code == 200
    body = {"tenant_id": str(seed.tenant_a), "challenge_id": challenge.json()["challenge_id"]}
    no_reauth = client.post("/api/v1/staff/context", json=body, headers=headers)
    assert no_reauth.status_code == 403 and no_reauth.json()["error"]["code"] == "reauth_required"
    # Token sin amr password (p. ej. sesión antigua): no basta.
    no_password = client.post(
        "/api/v1/staff/context", json=body, headers={**headers, "X-Reauth-Token": mint_token(qa_global)}
    )
    assert no_password.status_code == 403 and no_password.json()["error"]["code"] == "reauth_required"
    ok = client.post(
        "/api/v1/staff/context",
        json=body,
        headers={**headers, "X-Reauth-Token": mint_token(qa_global, password_at=datetime.now(UTC))},
    )
    assert ok.status_code == 200


def test_stale_reauthentication_keeps_current_tenant(client, qa_global, seed, owner_engine) -> None:
    assert switch_context(client, qa_global, seed.tenant_a).status_code == 200
    stale = switch_context(
        client, qa_global, seed.tenant_b, password_at=datetime.now(UTC) - timedelta(minutes=30)
    )
    assert stale.status_code == 403 and stale.json()["error"]["code"] == "reauth_stale"
    rows = _db(
        owner_engine,
        "SELECT tenant_id FROM staff_access_audit WHERE actor_id = :a AND action = 'context_select' "
        "ORDER BY created_at DESC, id DESC LIMIT 1",
        a=qa_global,
    )
    assert str(rows[0]["tenant_id"]) == str(seed.tenant_a)


def test_reauthentication_token_cannot_be_reused_for_another_change(client, qa_global, seed) -> None:
    headers = _h(qa_global)
    token = mint_token(qa_global, password_at=datetime.now(UTC))
    first = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_a)}, headers=headers
    )
    assert (
        client.post(
            "/api/v1/staff/context",
            json={"tenant_id": str(seed.tenant_a), "challenge_id": first.json()["challenge_id"]},
            headers={**headers, "X-Reauth-Token": token},
        ).status_code
        == 200
    )
    second = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_b)}, headers=headers
    )
    reused = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_b), "challenge_id": second.json()["challenge_id"]},
        headers={**headers, "X-Reauth-Token": token},
    )
    assert reused.status_code == 403 and reused.json()["error"]["code"] == "reauth_reused"


def test_challenge_is_bound_to_its_tenant(client, qa_global, seed) -> None:
    headers = _h(qa_global)
    ch = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_a)}, headers=headers
    )
    token = mint_token(qa_global, password_at=datetime.now(UTC))
    wrong_tenant = client.post(
        "/api/v1/staff/context",
        json={"tenant_id": str(seed.tenant_b), "challenge_id": ch.json()["challenge_id"]},
        headers={**headers, "X-Reauth-Token": token},
    )
    assert wrong_tenant.status_code == 403 and wrong_tenant.json()["error"]["code"] == "challenge_invalid"


def test_challenge_requests_are_rate_limited(client, qa_global, seed) -> None:
    headers = _h(qa_global)
    codes = [
        client.post(
            "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_a)}, headers=headers
        ).status_code
        for _ in range(12)
    ]
    assert codes[:10] == [200] * 10
    assert 429 in codes[10:]


def test_switching_between_tenants_audits_previous_new_and_reauth_time(
    client, qa_global, seed, owner_engine
) -> None:
    moment = datetime.now(UTC).replace(microsecond=0)
    assert switch_context(client, qa_global, seed.tenant_a, password_at=moment).status_code == 200
    assert switch_context(client, qa_global, seed.tenant_b, password_at=moment).status_code == 200
    rows = _db(
        owner_engine,
        "SELECT tenant_id, previous_tenant_id, reauthenticated_at FROM staff_access_audit "
        "WHERE actor_id = :a AND action = 'context_select' ORDER BY created_at, id",
        a=qa_global,
    )
    assert [
        (str(r["tenant_id"]), str(r["previous_tenant_id"]) if r["previous_tenant_id"] else None) for r in rows
    ] == [(str(seed.tenant_a), None), (str(seed.tenant_b), str(seed.tenant_a))]
    assert all(r["reauthenticated_at"] is not None for r in rows)


def test_operations_of_selected_tenant_are_only_the_selected_ones(client, qa_global, seed) -> None:
    switch_context(client, qa_global, seed.tenant_b)
    r = client.get(f"/api/v1/staff/tenants/{seed.tenant_b}/operations", headers=_h(qa_global))
    assert r.status_code == 200
    assert {item["tenant_id"] for item in r.json()["items"]} <= {str(seed.tenant_b)}


def test_revoking_global_scope_removes_discovery_and_challenges(
    client, qa_global, seed, owner_engine
) -> None:
    with owner_engine.begin() as conn:
        revoke_scope(conn, qa_global, "Revocación de prueba")
    assert client.get("/api/v1/staff/tenants", headers=_h(qa_global)).json()["items"] == []
    denied = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(seed.tenant_a)}, headers=_h(qa_global)
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
            grant_scope(conn, stranger, Authorization("Autorización de prueba", "Prueba sin rol"))
    with pytest.raises(Exception), owner_engine.begin() as conn:  # noqa: B017 - la restricción de la tabla rechaza
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by, tenant_scope) "
                "VALUES (:u, 'qa', true, 'Referencia de prueba', 'all_verified_support_tenants')"
            ),
            {"u": stranger},
        )
