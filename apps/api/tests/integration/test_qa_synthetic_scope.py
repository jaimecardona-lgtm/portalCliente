"""Modalidad QA interna: alcance sobre empresas sintéticas, con dos barreras (bandera de base de datos y
configuración del backend). Datos sintéticos de prueba con nombres ficticios. Solo base desechable.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.main import create_app
from app.services.staff_provisioning import (
    Authorization,
    ProvisioningError,
    grant_qa_synthetic_scope,
    grant_staff,
    revoke_scope,
    set_qa_synthetic_environment,
)
from tests.conftest import Seed, mint_token, switch_context

pytestmark = pytest.mark.integration

AUTH = Authorization("Autorización de prueba QA", "Revisión interna de prueba")


def _h(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user)}"}


@dataclass(frozen=True)
class QaTenants:
    a: UUID
    b: UUID


@pytest.fixture
def qa_flag(owner_engine: Engine):
    """Bandera apagada al empezar y al terminar cada prueba."""
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, False, AUTH)
    yield
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, False, AUTH)


@pytest.fixture
def qa_tenants(owner_engine: Engine, seed: Seed) -> QaTenants:
    """Dos empresas sintéticas con 3 operaciones y 2 eventos cada una. Sin verificación oficial."""
    ids = {}
    with owner_engine.begin() as conn:
        for key in ("a", "b"):
            tid = uuid4()
            ids[key] = tid
            conn.execute(
                text(
                    "INSERT INTO tenants (id, slug, legal_name, tax_id, segment) VALUES "
                    "(:i, :s, :n, :x, 'QA_SYNTHETIC_ONLY')"
                ),
                {"i": tid, "s": f"qa-prueba-{key}-{uuid4().hex[:6]}", "n": f"Empresa de prueba QA {key.upper()}",
                 "x": f"QA-{key.upper()}-{uuid4().hex[:6]}"},
            )
            for k in range(1, 4):
                op = uuid4()
                conn.execute(
                    text(
                        "INSERT INTO operation_refs (id, tenant_id, external_id, do_number) "
                        "VALUES (:o, :t, :e, :d)"
                    ),
                    {"o": op, "t": tid, "e": f"QA-{key}-{k}-{uuid4().hex[:4]}", "d": f"DO-QA-{key}-{k}-{uuid4().hex[:4]}"},
                )
                for j in range(1, 3):
                    conn.execute(
                        text(
                            "INSERT INTO operation_events (tenant_id, operation_id, external_event_id, event_type, "
                            "occurred_at, title) VALUES (:t, :o, :e, 'news', now(), 'Evento de prueba')"
                        ),
                        {"t": tid, "o": op, "e": f"EV-{uuid4().hex[:10]}-{j}"},
                    )
    return QaTenants(ids["a"], ids["b"])


@pytest.fixture
def qa_user(owner_engine: Engine, qa_tenants) -> UUID:
    user = uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA de prueba')"),
            {"u": user, "e": f"qa-sint-{user}@interno.test"},
        )
        grant_staff(conn, user, "qa", AUTH, None)
        grant_qa_synthetic_scope(conn, user, AUTH)
    return user


@pytest.fixture
def client_qa_on(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    settings = test_settings.model_copy(update={"qa_synthetic_enabled": True})
    app: FastAPI = create_app(settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_qa_off(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


def _ids(client, user) -> set[str]:
    return {i["id"] for i in client.get("/api/v1/staff/tenants", headers=_h(user)).json()["items"]}


def test_flag_off_hides_qa_companies_even_with_scope_and_config(
    client_qa_on, owner_engine, qa_user, qa_tenants, qa_flag
) -> None:
    assert str(qa_tenants.a) not in _ids(client_qa_on, qa_user)
    denied = client_qa_on.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(qa_tenants.a)}, headers=_h(qa_user)
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "tenant_not_authorized"


def test_config_off_hides_qa_companies_even_when_flag_is_on(
    client_qa_off, owner_engine, qa_user, qa_tenants, qa_flag
) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    assert not (_ids(client_qa_off, qa_user) & {str(qa_tenants.a), str(qa_tenants.b)})
    assert switch_context(client_qa_off, qa_user, qa_tenants.a).status_code == 403


def test_both_barriers_open_show_two_qa_companies_pending_integration(
    client_qa_on, owner_engine, qa_user, qa_tenants, qa_flag
) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    items = {i["id"]: i for i in client_qa_on.get("/api/v1/staff/tenants", headers=_h(qa_user)).json()["items"]}
    for tid in (str(qa_tenants.a), str(qa_tenants.b)):
        assert items[tid]["qa_synthetic"] is True
        assert items[tid]["integration_status"] == "pending_integration"
        assert items[tid]["external_tenant_id"] is None
    with owner_engine.connect() as conn:
        verified = conn.execute(
            text("SELECT count(*) FROM tenants WHERE id IN (:a, :b) AND (verified_at IS NOT NULL OR external_tenant_id IS NOT NULL)"),
            {"a": qa_tenants.a, "b": qa_tenants.b},
        ).scalar_one()
    assert verified == 0


def test_each_company_shows_only_its_own_operations_and_events(
    client_qa_on, owner_engine, qa_user, qa_tenants, qa_flag
) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    assert switch_context(client_qa_on, qa_user, qa_tenants.a).status_code == 200
    ops_a = client_qa_on.get(f"/api/v1/staff/tenants/{qa_tenants.a}/operations", headers=_h(qa_user)).json()["items"]
    assert len(ops_a) == 3 and {o["tenant_id"] for o in ops_a} == {str(qa_tenants.a)}
    op_id = ops_a[0]["id"]
    events_a = client_qa_on.get(
        f"/api/v1/staff/tenants/{qa_tenants.a}/operations/{op_id}/events", headers=_h(qa_user)
    ).json()["items"]
    assert len(events_a) == 2

    assert switch_context(client_qa_on, qa_user, qa_tenants.b).status_code == 200
    ops_b = client_qa_on.get(f"/api/v1/staff/tenants/{qa_tenants.b}/operations", headers=_h(qa_user)).json()["items"]
    assert len(ops_b) == 3
    assert {o["id"] for o in ops_a}.isdisjoint({o["id"] for o in ops_b})
    # Una operación de A no se puede consultar bajo B.
    cross = client_qa_on.get(
        f"/api/v1/staff/tenants/{qa_tenants.b}/operations/{op_id}/events", headers=_h(qa_user)
    ).json()["items"]
    assert cross == []


def test_switching_companies_is_audited(client_qa_on, owner_engine, qa_user, qa_tenants, qa_flag) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    assert switch_context(client_qa_on, qa_user, qa_tenants.a).status_code == 200
    with owner_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT count(*) FROM staff_access_audit WHERE actor_id = :u AND action = 'context_select' AND tenant_id = :t"),
            {"u": qa_user, "t": qa_tenants.a},
        ).scalar_one()
    assert rows == 1


def test_external_client_cannot_reach_qa_data(client_qa_on, owner_engine, seed, qa_tenants, qa_flag) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    r = client_qa_on.get("/api/v1/staff/tenants", headers=_h(seed.ana))
    assert r.status_code == 403 and r.json()["error"]["code"] == "no_staff_role"
    ops = client_qa_on.get(f"/api/v1/staff/tenants/{qa_tenants.a}/operations", headers=_h(seed.ana))
    assert ops.status_code == 403


def test_support_role_cannot_receive_qa_scope(owner_engine, seed) -> None:
    support = uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'Soporte de prueba')"),
            {"u": support, "e": f"soporte-sint-{support}@interno.test"},
        )
        grant_staff(conn, support, "support", AUTH, None)
    with owner_engine.begin() as conn:
        with pytest.raises(ProvisioningError):
            grant_qa_synthetic_scope(conn, support, AUTH)


def test_revoking_scope_removes_qa_access(client_qa_on, owner_engine, qa_user, qa_tenants, qa_flag) -> None:
    with owner_engine.begin() as conn:
        set_qa_synthetic_environment(conn, True, AUTH)
    assert str(qa_tenants.a) in _ids(client_qa_on, qa_user)
    with owner_engine.begin() as conn:
        revoke_scope(conn, qa_user, "Fin de la revisión de prueba")
    assert not (_ids(client_qa_on, qa_user) & {str(qa_tenants.a), str(qa_tenants.b)})


def test_qa_grant_never_sets_verification(owner_engine, qa_user, qa_tenants) -> None:
    with owner_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT verified_at, external_tenant_id FROM tenants WHERE id IN (:a, :b)"),
            {"a": qa_tenants.a, "b": qa_tenants.b},
        ).all()
    assert all(r[0] is None and r[1] is None for r in rows)
