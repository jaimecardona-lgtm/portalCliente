"""Alta de empresas sin integración, selector, Torre vacía y primeros registros creados desde el portal.

Datos sintéticos: etiquetas y códigos de prueba, NIT de ejemplo y dominios `.test`. Nunca se usan los nombres
reales del descubrimiento. Se ejecuta solo contra una base local desechable (PORTAL_TEST_DATABASE_URL).
"""

from __future__ import annotations

import uuid
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
    grant_scope,
    grant_tenant,
    provision_tenant,
)
from tests.conftest import Seed, mint_token, switch_context

pytestmark = pytest.mark.integration

AUTH = Authorization("Autorización de prueba", "Alta de prueba de aprovisionamiento")


@pytest.fixture(autouse=True)
def _limpiar_descubrimiento_sintetico(owner_engine: Engine):
    """Las etiquetas de prueba no deben quedar en el catálogo compartido (otras pruebas cuentan las nueve reales)."""
    yield
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM tenants WHERE discovery_observed_label LIKE 'Empresa de prueba%' "
                "OR discovery_observed_label LIKE 'Otra prueba%'"
            )
        )
        conn.execute(
            text(
                "DELETE FROM logixtic_tenant_discovery WHERE observed_label LIKE 'Empresa de prueba%' "
                "OR observed_label LIKE 'Otra prueba%'"
            )
        )


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


def _h(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user)}"}


@dataclass(frozen=True)
class Pending:
    tenant_id: UUID
    slug: str
    label: str


def _discover(conn, label: str) -> None:
    conn.execute(
        text("INSERT INTO logixtic_tenant_discovery (observed_label) VALUES (:l)"), {"l": label}
    )


def _new_pending(owner_engine: Engine, tax_id: str | None = None) -> Pending:
    """Empresa dada de alta desde un descubrimiento sintético. Sin operaciones ni identificador oficial."""
    label = f"Empresa de prueba {uuid4().hex[:8]}"
    slug = f"prov-{uuid4().hex[:10]}"
    with owner_engine.begin() as conn:
        _discover(conn, label)
        provision_tenant(
            conn, label, slug, "Empresa Prueba Aprovisionada S.A.S.", tax_id or f"8{uuid4().int % 10**8:08d}-1", AUTH
        )
        tid = conn.execute(text("SELECT id FROM tenants WHERE slug = :s"), {"s": slug}).scalar_one()
    return Pending(tid, slug, label)


def _new_staff(owner_engine: Engine, role: str = "qa") -> UUID:
    user = uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, 'Personal de prueba')"),
            {"u": user, "e": f"staff-{user}@interno.test"},
        )
        conn.execute(
            text(
                "INSERT INTO platform_staff (user_id, staff_role, active, authorized_by) "
                "VALUES (:u, :r, true, 'Referencia de autorización de prueba')"
            ),
            {"u": user, "r": role},
        )
    return user


def _assign(owner_engine: Engine, user: UUID, pending: Pending) -> None:
    with owner_engine.begin() as conn:
        grant_tenant(conn, user, pending.slug, AUTH)


def _count(owner_engine: Engine, sql: str, **params) -> int:
    with owner_engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


# ---------------------------------------------------------------------------
# 1 y 10. Alta sin operaciones ni identificador externo; idempotencia; no duplicados
# ---------------------------------------------------------------------------
def test_provisioning_needs_no_official_id_and_starts_empty(owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    with owner_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT external_tenant_id, verified_at, integration_status, discovery_observed_label, "
                "is_demo FROM tenants WHERE id = :t"
            ),
            {"t": p.tenant_id},
        ).mappings().one()
    assert row["external_tenant_id"] is None
    assert row["verified_at"] is None
    assert row["integration_status"] == "pending_integration"
    assert row["discovery_observed_label"] == p.label
    assert row["is_demo"] is False
    for table in ("client_accounts", "operation_refs", "operation_events", "requests"):
        assert _count(owner_engine, f"SELECT count(*) FROM {table} WHERE tenant_id = :t", t=p.tenant_id) == 0


def test_provisioning_is_idempotent_and_never_duplicates(owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    with owner_engine.begin() as conn:
        message = provision_tenant(conn, p.label, "otro-codigo-x", "Otro nombre", "900777001-1", AUTH)
    assert "ya estaba" in message
    assert _count(owner_engine, "SELECT count(*) FROM tenants WHERE discovery_observed_label = :l", l=p.label) == 1
    assert _count(owner_engine, "SELECT count(*) FROM tenants WHERE slug = 'otro-codigo-x'") == 0


def test_provisioning_rejects_unknown_label_duplicate_nit_and_missing_nit(owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    with owner_engine.begin() as conn:
        with pytest.raises(ProvisioningError):
            provision_tenant(conn, "Etiqueta inexistente de prueba", "x-inexistente", "Nombre", "900888001-1", AUTH)
    other_label = f"Otra prueba {uuid4().hex[:8]}"
    with owner_engine.begin() as conn:
        _discover(conn, other_label)
        with pytest.raises(ProvisioningError):
            provision_tenant(conn, other_label, "dup-nit", "Otra empresa S.A.S.", "", AUTH)
        # Mismo NIT que la empresa ya dada de alta: no se duplica.
        tax = conn.execute(text("SELECT tax_id FROM tenants WHERE id = :t"), {"t": p.tenant_id}).scalar_one()
        with pytest.raises(ProvisioningError):
            provision_tenant(conn, other_label, "dup-nit", "Otra empresa S.A.S.", tax, AUTH)


def test_discovery_uuid_is_not_used_as_external_id(owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    with owner_engine.connect() as conn:
        discovery_id = conn.execute(
            text("SELECT id FROM logixtic_tenant_discovery WHERE observed_label = :l"), {"l": p.label}
        ).scalar_one()
        external = conn.execute(text("SELECT external_tenant_id FROM tenants WHERE id = :t"), {"t": p.tenant_id}).scalar()
    assert external is None
    assert str(discovery_id) != str(external)


# ---------------------------------------------------------------------------
# 2 a 6. QA habilitado: selector, Torre vacía, registros que persisten
# ---------------------------------------------------------------------------
def test_qa_sees_pending_tenant_in_selector_and_opens_empty_tower(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    _assign(owner_engine, qa, p)
    items = client.get("/api/v1/staff/tenants", headers=_h(qa)).json()["items"]
    mine = next(i for i in items if i["id"] == str(p.tenant_id))
    assert mine["integration_status"] == "pending_integration"
    assert mine["external_tenant_id"] is None
    assert switch_context(client, qa, p.tenant_id).status_code == 200
    ops = client.get(f"/api/v1/staff/tenants/{p.tenant_id}/operations", headers=_h(qa))
    assert ops.status_code == 200 and ops.json()["items"] == []


def test_qa_creates_client_but_cannot_create_requests_outside_synthetic_qa(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    _assign(owner_engine, qa, p)
    assert switch_context(client, qa, p.tenant_id).status_code == 200

    account = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/client-accounts",
        json={"legal_name": "Cliente Final Ficticio S.A.S.", "tax_id": "700000001-1"},
        headers=_h(qa),
    )
    assert account.status_code == 201
    assert account.json()["item"]["origin"] == "portal_manual"

    request = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/requests",
        json={
            "request_type": "consulta",
            "subject": "Consulta de prueba aprovisionamiento",
            "description": "Solicitud sintética creada desde el portal para verificar la persistencia.",
        },
        headers=_h(qa),
    )
    assert request.status_code == 403
    assert request.json()["error"]["code"] == "permission_denied"
    assert _count(owner_engine, "SELECT count(*) FROM client_accounts WHERE tenant_id = :t", t=p.tenant_id) == 1
    assert _count(owner_engine, "SELECT count(*) FROM requests WHERE tenant_id = :t", t=p.tenant_id) == 0


# ---------------------------------------------------------------------------
# 7 a 9. Segunda empresa aislada; externo sin acceso
# ---------------------------------------------------------------------------
def test_second_pending_company_shares_nothing_with_the_first(client, owner_engine, seed) -> None:
    first = _new_pending(owner_engine)
    second = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    _assign(owner_engine, qa, first)
    _assign(owner_engine, qa, second)

    assert switch_context(client, qa, first.tenant_id).status_code == 200
    denied = client.post(
        f"/api/v1/staff/tenants/{first.tenant_id}/requests",
        json={"request_type": "otro", "subject": "Solicitud de la primera", "description": "Solo para la primera empresa."},
        headers=_h(qa),
    )
    assert denied.status_code == 403

    assert switch_context(client, qa, second.tenant_id).status_code == 200
    assert client.get(f"/api/v1/staff/tenants/{second.tenant_id}/requests", headers=_h(qa)).json()["items"] == []
    assert client.get(f"/api/v1/staff/tenants/{second.tenant_id}/operations", headers=_h(qa)).json()["items"] == []


def test_write_without_selected_tenant_is_refused_by_the_database(owner_engine, seed) -> None:
    """RLS: sin el tenant seleccionado por FastAPI, el personal no puede insertar en ninguna empresa."""
    from sqlalchemy.exc import DBAPIError

    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    _assign(owner_engine, qa, p)
    with owner_engine.begin() as conn:
        conn.execute(text("SET LOCAL ROLE portal_app"))
        conn.execute(text("SELECT set_config('app.current_user_id', :u, true)"), {"u": str(qa)})
        with pytest.raises(DBAPIError):
            conn.execute(
                text(
                    "INSERT INTO client_accounts (tenant_id, legal_name) VALUES (:t, 'Sin contexto de prueba')"
                ),
                {"t": p.tenant_id},
            )


def test_external_client_cannot_reach_the_pending_company(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    denied = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/requests",
        json={"request_type": "consulta", "subject": "Intento de cliente externo", "description": "No debe llegar a la base de datos."},
        headers=_h(seed.ana),
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "no_staff_role"
    assert _count(owner_engine, "SELECT count(*) FROM requests WHERE tenant_id = :t", t=p.tenant_id) == 0


def test_staff_without_grant_cannot_challenge_pending_company(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    r = client.post("/api/v1/staff/context/challenge", json={"tenant_id": str(p.tenant_id)}, headers=_h(qa))
    assert r.status_code == 403 and r.json()["error"]["code"] == "tenant_not_authorized"


def test_global_scope_does_not_include_pending_companies(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    with owner_engine.begin() as conn:
        grant_scope(conn, qa, Authorization("Autorización de prueba", "Alcance global de prueba"))
    ids = {i["id"] for i in client.get("/api/v1/staff/tenants", headers=_h(qa)).json()["items"]}
    assert str(p.tenant_id) not in ids


def test_support_role_cannot_see_or_write_pending_companies(client, owner_engine, seed) -> None:
    """El trabajo en empresas pendientes exige 'tenants.work_pending'; soporte no lo tiene aunque tenga asignación."""
    p = _new_pending(owner_engine)
    support = _new_staff(owner_engine, role="support")
    _assign(owner_engine, support, p)
    ids = {i["id"] for i in client.get("/api/v1/staff/tenants", headers=_h(support)).json()["items"]}
    assert str(p.tenant_id) not in ids
    challenge = client.post(
        "/api/v1/staff/context/challenge", json={"tenant_id": str(p.tenant_id)}, headers=_h(support)
    )
    assert challenge.status_code == 403 and challenge.json()["error"]["code"] == "tenant_not_authorized"
    r = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/client-accounts",
        json={"legal_name": "Cliente que no debe crearse"},
        headers=_h(support),
    )
    assert r.status_code == 403
    assert _count(owner_engine, "SELECT count(*) FROM client_accounts WHERE tenant_id = :t", t=p.tenant_id) == 0


def test_request_body_rejects_unknown_fields_and_short_text(client, owner_engine, seed) -> None:
    p = _new_pending(owner_engine)
    qa = _new_staff(owner_engine)
    _assign(owner_engine, qa, p)
    assert switch_context(client, qa, p.tenant_id).status_code == 200
    extra = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/requests",
        json={"request_type": "consulta", "subject": "Solicitud válida", "description": "Descripción suficientemente larga.", "status": "cerrada"},
        headers=_h(qa),
    )
    short = client.post(
        f"/api/v1/staff/tenants/{p.tenant_id}/requests",
        json={"request_type": "consulta", "subject": "x", "description": "corta"},
        headers=_h(qa),
    )
    assert extra.status_code == 422 and short.status_code == 422
    assert _count(owner_engine, "SELECT count(*) FROM requests WHERE tenant_id = :t", t=p.tenant_id) == 0


def test_seed_tenants_are_untouched_by_provisioning(owner_engine, seed) -> None:
    _new_pending(owner_engine)
    with owner_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM tenants WHERE id IN (:a, :b)"), {"a": seed.tenant_a, "b": seed.tenant_b}).scalar_one() == 2
