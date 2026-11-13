"""Logix (POST /api/v1/logix/chat) contra PostgreSQL: aislamiento por empresa, personal y ausencia de datos.

Datos sintéticos del fixture. El proveedor de IA está deshabilitado: nunca se llama a OpenRouter.
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

NO_TENANT_TEXT = "Seleccione una empresa autorizada para consultar sus operaciones."


def _h(user_id, tenant=None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {mint_token(user_id)}"}
    if tenant is not None:
        headers["X-Tenant-Id"] = str(tenant)
    return headers


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


def _do_of(engine: Engine, op_id) -> str:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT do_number FROM operation_refs WHERE id = :o"), {"o": op_id}
        ).scalar_one()


def _ask(client: TestClient, user, tenant, message: str):
    return client.post("/api/v1/logix/chat", json={"message": message}, headers=_h(user, tenant))


def test_client_is_answered_only_from_its_own_tenant(client, seed, owner_engine) -> None:
    foreign_do = _do_of(owner_engine, seed.op_b)
    r = _ask(client, seed.ana, seed.tenant_a, f"¿Qué estado tiene {foreign_do}?")
    assert r.status_code == 200
    body = r.json()
    assert body["answer_kind"] == "deterministic"
    with owner_engine.connect() as conn:
        foreign = conn.execute(
            text("SELECT reference, last_known_status FROM operation_refs WHERE id = :o"), {"o": seed.op_b}
        ).one()
    assert "No encontré la operación" in body["answer"]
    assert foreign.reference not in body["answer"]
    assert foreign.last_known_status not in body["answer"]
    assert body["sources"] == []


def test_client_cannot_name_another_tenant_in_the_header(client, seed) -> None:
    r = _ask(client, seed.ana, seed.tenant_b, "¿Cuántas operaciones tengo?")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "tenant_not_authorized"


def test_client_own_operation_is_found_by_do_number(client, seed, owner_engine) -> None:
    own_do = _do_of(owner_engine, seed.op_a)
    r = _ask(client, seed.ana, seed.tenant_a, f"¿Qué estado tiene {own_do}?")
    assert r.status_code == 200
    assert own_do in r.json()["answer"]
    assert r.json()["sources"] == [own_do]


def test_user_without_company_gets_the_no_company_answer_not_data(client, seed) -> None:
    r = _ask(client, seed.eva, None, "¿Cuántas operaciones tengo?")
    assert r.status_code == 200
    assert r.json()["answer"] == NO_TENANT_TEXT
    assert r.json()["tenant"] is None


def test_general_question_never_reaches_a_disabled_provider(client, seed) -> None:
    r = _ask(client, seed.ana, seed.tenant_a, "¿Qué es un incoterm?")
    assert r.status_code == 200
    assert r.json()["answer_kind"] == "unavailable"
    assert "no está activo" in r.json()["answer"]


def test_message_length_and_unknown_fields_are_rejected(client, seed) -> None:
    too_long = _ask(client, seed.ana, seed.tenant_a, "x" * 801)
    assert too_long.status_code == 422
    extra = client.post(
        "/api/v1/logix/chat",
        json={"message": "hola", "tenant_id": str(seed.tenant_b)},
        headers=_h(seed.ana, seed.tenant_a),
    )
    assert extra.status_code == 422


def test_staff_with_global_scope_switches_tenants_and_is_audited(client, seed, owner_engine) -> None:
    qa = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'QA Logix Prueba')"),
            {"u": qa, "e": f"qa-logix-{qa}@interno.test"},
        )
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by) "
                "VALUES (:u, 'qa', true, 'Referencia de prueba')"
            ),
            {"u": qa},
        )
        conn.execute(
            text("UPDATE tenants SET external_tenant_id = 'EXT-A-0001', verified_at = now() WHERE id = :t"),
            {"t": seed.tenant_a},
        )
        conn.execute(
            text("UPDATE tenants SET external_tenant_id = 'EXT-B-0001', verified_at = now() WHERE id = :t"),
            {"t": seed.tenant_b},
        )
        grant_scope(conn, qa, Authorization("Autorización de prueba", "Soporte de prueba de Logix"))

    do_b = _do_of(owner_engine, seed.op_b)
    do_a = _do_of(owner_engine, seed.op_a)
    in_a = _ask(client, qa, seed.tenant_a, f"¿Qué estado tiene {do_b}?").json()
    assert "No encontré" in in_a["answer"] and in_a["tenant"] is not None
    in_b = _ask(client, qa, seed.tenant_b, f"¿Qué estado tiene {do_b}?").json()
    assert do_b in in_b["answer"]
    assert _ask(client, qa, seed.tenant_a, f"¿Qué estado tiene {do_a}?").json()["sources"] == [do_a]

    with owner_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT tenant_id FROM staff_access_audit WHERE actor_id = :a AND action = 'operations_list' "
                "ORDER BY created_at"
            ),
            {"a": qa},
        ).all()
    assert [str(r[0]) for r in rows][-3:] == [str(seed.tenant_a), str(seed.tenant_b), str(seed.tenant_a)]
