"""Primer flujo persistente: aprovisionamiento de desarrollo, lectura de operación y comentario guardado.

Usa PostgreSQL con la migración aplicada. Los identificadores de usuario son sintéticos (no existen en
Supabase Auth): la verificación de identidad se prueba con tokens firmados con el secreto de prueba.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.services.provisioning import (
    DevMembership,
    provision_membership,
    provision_synthetic_operation,
)
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration


def _h(user_id) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(user_id)}"}


def _provision(
    engine: Engine, *, user_id, slug: str, role: str = "client_admin", name: str = "Usuaria Sintética"
):
    with engine.begin() as conn:
        provision_membership(
            conn,
            DevMembership(
                user_id=user_id,
                email=f"{user_id}@cliente.test",
                full_name=name,
                tenant_slug=slug,
                tenant_legal_name=f"Empresa sintética {slug}",
                tenant_tax_id="900999999-9",
                role=role,
            ),
        )
        return provision_synthetic_operation(conn, slug)


def test_provisioning_is_idempotent(owner_engine: Engine, seed: Seed) -> None:
    user = uuid4()
    first = _provision(owner_engine, user_id=user, slug="tn-nuevo")
    second = _provision(owner_engine, user_id=user, slug="tn-nuevo")
    assert first == second
    with owner_engine.connect() as conn:
        counts = conn.execute(
            text(
                "SELECT (SELECT count(*) FROM tenant_memberships WHERE user_id = :u), "
                "(SELECT count(*) FROM operation_refs o JOIN tenants t ON t.id = o.tenant_id "
                " WHERE t.slug = 'tn-nuevo'), "
                "(SELECT count(*) FROM operation_events e JOIN tenants t ON t.id = e.tenant_id "
                " WHERE t.slug = 'tn-nuevo')"
            ),
            {"u": user},
        ).one()
    assert tuple(counts) == (1, 1, 1)


def test_provisioned_user_reads_only_own_company(
    client: TestClient, owner_engine: Engine, seed: Seed
) -> None:
    user = uuid4()
    op_id = _provision(owner_engine, user_id=user, slug="tn-nuevo")

    me = client.get("/api/v1/me", headers=_h(user))
    assert me.status_code == 200
    assert me.json()["tenant"]["slug"] == "tn-nuevo"
    assert me.json()["role"] == "client_admin"

    ops = client.get("/api/v1/operations", headers=_h(user)).json()
    assert [o["id"] for o in ops] == [str(op_id)]
    assert str(seed.op_a) not in str(ops)
    assert client.get(f"/api/v1/operations/{seed.op_a}", headers=_h(user)).status_code == 404


def test_published_comment_is_persisted_and_readable_back(
    client: TestClient, owner_engine: Engine, seed: Seed
) -> None:
    user = uuid4()
    op_id = _provision(owner_engine, user_id=user, slug="tn-nuevo")
    with owner_engine.connect() as conn:
        event_id = conn.execute(
            text("SELECT id FROM operation_events WHERE operation_id = :op"), {"op": op_id}
        ).scalar_one()

    url = f"/api/v1/operations/{op_id}/events/{event_id}/comments"
    root = client.post(url, headers=_h(user), json={"body": "¿Cuándo sale el contenedor?"})
    assert root.status_code == 201
    reply = client.post(
        url,
        headers=_h(user),
        json={"body": "Respuesta de seguimiento.", "parent_comment_id": root.json()["id"]},
    )
    assert reply.status_code == 201

    # Lectura nueva desde la base de datos: no depende del objeto devuelto al crear.
    listed = client.get(url, headers=_h(user)).json()
    assert [c["body"] for c in listed] == ["¿Cuándo sale el contenedor?", "Respuesta de seguimiento."]
    assert listed[1]["parent_comment_id"] == root.json()["id"]

    # Otra empresa no ve ese hilo.
    assert client.get(url, headers=_h(seed.ana)).status_code == 404

    with owner_engine.connect() as conn:
        stored = conn.execute(
            text("SELECT count(*) FROM event_comments WHERE event_id = :e"), {"e": event_id}
        ).scalar_one()
    assert stored == 2
