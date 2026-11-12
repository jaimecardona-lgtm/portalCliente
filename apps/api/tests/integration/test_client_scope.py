# ruff: noqa: E501 - las cadenas SQL de estas pruebas son literales largos y legibles
"""Nivel B de aislamiento: cliente final dentro de una empresa (migración 20261112000000_client_scope).

Datos sintéticos del fixture `seed`. Las consultas corren como `portal_app` (sin BYPASSRLS) tras SET LOCAL ROLE.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, IntegrityError

from tests.conftest import Seed

pytestmark = pytest.mark.integration


@contextmanager
def _denied() -> Iterator[None]:
    """Espera un rechazo por privilegios o RLS (SQLSTATE 42501)."""
    with pytest.raises(DBAPIError) as info:
        yield
    assert info.value.orig is not None
    assert info.value.orig.sqlstate == "42501"


def _as_user(conn, user_id: uuid.UUID | None) -> None:
    conn.execute(text("SET LOCAL ROLE portal_app"))
    conn.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id or "")})


def _ops(conn) -> set[uuid.UUID]:
    return {r[0] for r in conn.execute(text("SELECT id FROM operation_refs")).all()}


def test_tenant_member_sees_only_own_client_operations(owner_engine: Engine, seed: Seed) -> None:
    """beto y ana son de A, pero solo de A1: no ven A2 aunque sea de la misma empresa."""
    with owner_engine.begin() as conn:
        _as_user(conn, seed.beto)
        assert _ops(conn) == {seed.op_a}
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        assert _ops(conn) == {seed.op_a}


def test_tenant_member_without_client_membership_sees_nothing_of_that_client(
    owner_engine: Engine, seed: Seed
) -> None:
    """dora pertenece a A y a B, pero no tiene acceso a A1 ni a A2."""
    with owner_engine.begin() as conn:
        _as_user(conn, seed.dora)
        ops = _ops(conn)
    assert seed.op_a not in ops
    assert seed.op_a2 not in ops
    assert ops == {seed.op_b}


def test_operation_without_client_is_invisible_to_everyone_in_portal(
    owner_engine: Engine, seed: Seed
) -> None:
    orphan = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO operation_refs (id, tenant_id, external_id, do_number) "
                "VALUES (:id, :tenant, 'LX-SIN-CLIENTE', 'DO-SIN-CLIENTE')"
            ),
            {"id": orphan, "tenant": seed.tenant_a},
        )
    for user in (seed.ana, seed.beto, seed.dora):
        with owner_engine.begin() as conn:
            _as_user(conn, user)
            assert orphan not in _ops(conn)


def test_client_membership_must_belong_to_a_tenant_member(owner_engine: Engine, seed: Seed) -> None:
    """carla es miembro de B, no de A: no puede pertenecer a un cliente de A por error de datos."""
    with pytest.raises(IntegrityError), owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO client_memberships (tenant_id, client_account_id, user_id, role) "
                "VALUES (:tenant, :client, :user, 'client_viewer')"
            ),
            {"tenant": seed.tenant_a, "client": seed.client_a1, "user": seed.carla},
        )


def test_operation_cannot_point_to_a_client_of_another_tenant(owner_engine: Engine, seed: Seed) -> None:
    with pytest.raises(IntegrityError), owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE operation_refs SET client_account_id = :client WHERE id = :op"),
            {"client": seed.client_a1, "op": seed.op_b},
        )


def test_client_viewer_cannot_comment_but_client_admin_can(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.beto)  # client_viewer de A1
        with _denied():
            conn.execute(
                text(
                    "INSERT INTO event_comments (tenant_id, operation_id, event_id, author_id, author_name, author_side, body, visibility) "
                    "VALUES (:t, :o, :e, :a, 'Beto Prueba', 'client', 'Intento de comentario', 'client')"
                ),
                {"t": seed.tenant_a, "o": seed.op_a, "e": seed.event_a_public, "a": seed.beto},
            )
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)  # client_admin de A1
        conn.execute(
            text(
                "INSERT INTO event_comments (tenant_id, operation_id, event_id, author_id, author_name, author_side, body, visibility) "
                "VALUES (:t, :o, :e, :a, 'Ana Prueba', 'client', 'Comentario válido', 'client')"
            ),
            {"t": seed.tenant_a, "o": seed.op_a, "e": seed.event_a_public, "a": seed.ana},
        )


def test_comment_on_operation_of_other_client_is_denied(owner_engine: Engine, seed: Seed) -> None:
    """ana es admin de A1; no puede comentar en A2 aunque sea la misma empresa."""
    event_a2 = uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type, occurred_at, title, visibility) "
                "VALUES (:id, :t, :o, 'EV-A2-1', 'news', now(), 'Evento de A2', 'client')"
            ),
            {"id": event_a2, "t": seed.tenant_a, "o": seed.op_a2},
        )
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        with _denied():
            conn.execute(
                text(
                    "INSERT INTO event_comments (tenant_id, operation_id, event_id, author_id, author_name, author_side, body, visibility) "
                    "VALUES (:t, :o, :e, :a, 'Ana Prueba', 'client', 'Fuera de mi cliente', 'client')"
                ),
                {"t": seed.tenant_a, "o": seed.op_a2, "e": event_a2, "a": seed.ana},
            )


def test_deactivated_tenant_membership_removes_client_access(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE tenant_memberships SET active = false WHERE user_id = :u AND tenant_id = :t"),
            {"u": seed.ana, "t": seed.tenant_a},
        )
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        assert _ops(conn) == set()


def test_user_sees_only_own_client_memberships(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        rows = conn.execute(text("SELECT user_id FROM client_memberships")).all()
    assert {r[0] for r in rows} == {seed.ana}


def test_administrative_tables_are_not_readable_by_portal(owner_engine: Engine, seed: Seed) -> None:
    for statement in ("SELECT count(*) FROM sync_runs",):
        with owner_engine.begin() as conn:
            _as_user(conn, seed.ana)
            with _denied():
                conn.execute(text(statement))
