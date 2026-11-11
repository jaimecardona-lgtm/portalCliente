# ruff: noqa: E501 - las cadenas SQL de estas pruebas son literales largos y legibles
"""Pruebas de integración de la base de datos: RLS y referencias cruzadas entre empresas.

Se ejecutan contra PostgreSQL real con la migración aplicada. Las consultas de la aplicación corren
como `portal_app` (sin BYPASSRLS) tras `SET LOCAL ROLE`, igual que en producción.
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
def _rls_denied() -> Iterator[None]:
    """Espera un rechazo de RLS por código SQLSTATE 42501 (independiente del idioma del servidor)."""
    with pytest.raises(DBAPIError) as info:
        yield
    assert info.value.orig is not None
    assert info.value.orig.sqlstate == "42501"


def _as_user(conn, user_id: uuid.UUID | None) -> None:
    conn.execute(text("SET LOCAL ROLE portal_app"))
    conn.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id or "")})


def test_app_role_cannot_bypass_rls(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.connect() as conn:
        row = conn.execute(
            text("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'portal_app'")
        ).one()
    assert row.rolbypassrls is False
    assert row.rolsuper is False


def test_user_sees_only_own_tenant_operations(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        ops = {r[0] for r in conn.execute(text("SELECT id FROM operation_refs")).all()}
    assert ops == {seed.op_a}


def test_without_identity_nothing_is_visible(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, None)
        counts = conn.execute(
            text(
                "SELECT (SELECT count(*) FROM operation_refs), (SELECT count(*) FROM tenants), "
                "(SELECT count(*) FROM tenant_memberships)"
            )
        ).one()
    assert tuple(counts) == (0, 0, 0)


def test_internal_events_and_comments_are_hidden_by_rls(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        events = {r[0] for r in conn.execute(text("SELECT id FROM operation_events")).all()}
        comments = {r[0] for r in conn.execute(text("SELECT id FROM event_comments")).all()}
    assert seed.event_a_internal not in events
    assert seed.comment_a_internal not in comments
    assert seed.event_a_public in events
    assert seed.comment_a_public in comments


def test_multi_tenant_user_sees_both_tenants_only_for_own_memberships(
    owner_engine: Engine, seed: Seed
) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.dora)
        tenants = {r[0] for r in conn.execute(text("SELECT id FROM tenants")).all()}
        ops = {r[0] for r in conn.execute(text("SELECT id FROM operation_refs")).all()}
    assert tenants == {seed.tenant_a, seed.tenant_b}
    assert ops == {seed.op_a, seed.op_b}


def test_user_cannot_read_other_profiles(owner_engine: Engine, seed: Seed) -> None:
    """Un cliente no puede leer el perfil de un compañero; el nombre del autor se copia en el comentario."""
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        ids = {r[0] for r in conn.execute(text("SELECT id FROM profiles")).all()}
    assert ids == {seed.ana}


def test_user_cannot_insert_comment_in_other_tenant(owner_engine: Engine, seed: Seed) -> None:
    """Ana (empresa A) intenta comentar un evento de la empresa B: RLS lo rechaza."""
    with _rls_denied():
        with owner_engine.begin() as conn:
            _as_user(conn, seed.ana)
            conn.execute(
                text(
                    "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, author_id, author_name, "
                    "author_side, body, visibility) VALUES (:id, :t, :o, :e, :a, 'Ana Prueba', 'client', 'x', 'client')"
                ),
                {
                    "id": uuid.uuid4(),
                    "t": seed.tenant_b,
                    "o": seed.op_b,
                    "e": seed.event_b_public,
                    "a": seed.ana,
                },
            )


def test_client_cannot_insert_operator_or_internal_comment(owner_engine: Engine, seed: Seed) -> None:
    with _rls_denied():
        with owner_engine.begin() as conn:
            _as_user(conn, seed.ana)
            conn.execute(
                text(
                    "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, author_id, author_name, "
                    "author_side, body, visibility) VALUES (:id, :t, :o, :e, :a, 'Ana Prueba', 'operator', 'x', 'client')"
                ),
                {
                    "id": uuid.uuid4(),
                    "t": seed.tenant_a,
                    "o": seed.op_a,
                    "e": seed.event_a_public,
                    "a": seed.ana,
                },
            )


def test_viewer_cannot_insert_comment_even_with_direct_sql(owner_engine: Engine, seed: Seed) -> None:
    with _rls_denied():
        with owner_engine.begin() as conn:
            _as_user(conn, seed.beto)
            conn.execute(
                text(
                    "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, author_id, author_name, "
                    "author_side, body, visibility) VALUES (:id, :t, :o, :e, :a, 'Beto Prueba', 'client', 'x', 'client')"
                ),
                {
                    "id": uuid.uuid4(),
                    "t": seed.tenant_a,
                    "o": seed.op_a,
                    "e": seed.event_a_public,
                    "a": seed.beto,
                },
            )


def test_request_cannot_be_created_for_other_tenant(owner_engine: Engine, seed: Seed) -> None:
    with _rls_denied():
        with owner_engine.begin() as conn:
            _as_user(conn, seed.ana)
            conn.execute(
                text(
                    "INSERT INTO requests (id, tenant_id, number, request_type, subject, description, created_by) "
                    "VALUES (:id, :t, 'SOL-1', 'consulta', 'Asunto de prueba', 'Descripción de prueba suficiente', :u)"
                ),
                {"id": uuid.uuid4(), "t": seed.tenant_b, "u": seed.ana},
            )


# --- Referencias cruzadas: la base de datos rechaza aunque la aplicación falle ----------------------


def test_comment_cannot_reference_event_of_other_tenant(owner_engine: Engine, seed: Seed) -> None:
    """Comentario de empresa A apuntando a un evento de empresa B: clave compuesta lo impide."""
    with pytest.raises(IntegrityError):
        with owner_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, author_id, author_name, "
                    "author_side, body, visibility) VALUES (:id, :t, :o, :e, :a, 'Ana Prueba', 'client', 'x', 'client')"
                ),
                {
                    "id": uuid.uuid4(),
                    "t": seed.tenant_a,
                    "o": seed.op_a,
                    "e": seed.event_b_public,
                    "a": seed.ana,
                },
            )


def test_event_cannot_reference_operation_of_other_tenant(owner_engine: Engine, seed: Seed) -> None:
    with pytest.raises(IntegrityError):
        with owner_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type, "
                    "occurred_at, title, visibility) VALUES (:id, :t, :o, 'EV-X', 'news', now(), 'Cruce', 'client')"
                ),
                {"id": uuid.uuid4(), "t": seed.tenant_a, "o": seed.op_b},
            )


def test_reply_cannot_point_to_comment_of_other_event(owner_engine: Engine, seed: Seed) -> None:
    """Respuesta con padre de otro evento de la MISMA empresa: la clave (padre, tenant, evento) lo impide."""
    other_event, other_comment = uuid.uuid4(), uuid.uuid4()
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type, "
                "occurred_at, title, visibility) VALUES (:id, :t, :o, 'EV-A-9', 'news', now(), 'Otro evento', 'client')"
            ),
            {"id": other_event, "t": seed.tenant_a, "o": seed.op_a},
        )
        conn.execute(
            text(
                "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, author_id, author_name, "
                "author_side, body, visibility) VALUES (:id, :t, :o, :e, :a, 'Ana Prueba', 'client', 'x', 'client')"
            ),
            {"id": other_comment, "t": seed.tenant_a, "o": seed.op_a, "e": other_event, "a": seed.ana},
        )
    with pytest.raises(IntegrityError):
        with owner_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO event_comments (id, tenant_id, operation_id, event_id, parent_comment_id, author_id, "
                    "author_name, author_side, body, visibility) VALUES (:id, :t, :o, :e, :p, :a, 'Ana Prueba', "
                    "'client', 'x', 'client')"
                ),
                {
                    "id": uuid.uuid4(),
                    "t": seed.tenant_a,
                    "o": seed.op_a,
                    "e": seed.event_a_public,
                    "p": other_comment,
                    "a": seed.ana,
                },
            )
