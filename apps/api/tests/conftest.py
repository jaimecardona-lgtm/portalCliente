"""Fixtures compartidas.

Pruebas de integración: requieren PostgreSQL con la migración aplicada. Se activan con
`PORTAL_TEST_DATABASE_URL` (superusuario o propietario del esquema, p. ej. una base local `portal_test`).
Sin esa variable se omiten; nunca se apuntan a una base remota.

Todos los datos son sintéticos: dominios `.test`, nombres ficticios y NIT de ejemplo.
El secreto de firma es solo para pruebas y nunca se usa fuera de ellas.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import EventComment, OperationEvent, OperationRef, Profile, Tenant, TenantMembership
from app.main import create_app

TEST_SECRET = "solo-para-pruebas-0123456789abcdefghijklmnop"  # noqa: S105 - secreto de prueba
SUPABASE_URL = "https://proyecto-prueba.supabase.test"
ISSUER = f"{SUPABASE_URL}/auth/v1"
ADMIN_ROLE = "portal_app"


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("PORTAL_TEST_DATABASE_URL"):
        return
    skip = pytest.mark.skip(reason="Defina PORTAL_TEST_DATABASE_URL para ejecutar pruebas de integración.")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("PORTAL_TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("Sin PORTAL_TEST_DATABASE_URL.")
    return url


@pytest.fixture(scope="session")
def owner_engine(database_url: str) -> Iterator[Engine]:
    engine = create_engine(database_url, future=True)
    yield engine
    engine.dispose()


@pytest.fixture
def test_settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        database_url=database_url,
        database_app_role=ADMIN_ROLE,
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=SecretStr(TEST_SECRET),
        cors_allowed_origins=["http://127.0.0.1:5173"],
    )


@dataclass
class Seed:
    tenant_a: UUID
    tenant_b: UUID
    ana: UUID  # client_admin de A
    beto: UUID  # client_viewer de A
    carla: UUID  # client_member de B
    dora: UUID  # client_member de A y de B
    eva: UUID  # sin membresías
    op_a: UUID  # cliente final A1 (ana admin, beto viewer)
    op_b: UUID  # cliente final B1 (carla admin, dora viewer)
    op_a2: UUID  # cliente final A2 (sin miembros de portal): solo visible para el equipo interno
    client_a1: UUID
    client_a2: UUID
    client_b1: UUID
    event_a_public: UUID
    event_a_internal: UUID
    event_b_public: UUID
    comment_a_public: UUID
    comment_a_internal: UUID
    comment_b_public: UUID


_TABLES = (
    "client_document_events, client_documents, storage_cleanup_jobs, attachments, requests, event_comments, "
    "operation_events, operation_refs, client_memberships, client_accounts, tenant_memberships, profiles, "
    "tenants"
)


@pytest.fixture
def seed(owner_engine: Engine) -> Iterator[Seed]:
    """Reinicia y siembra dos empresas sintéticas con usuarios, operaciones, eventos y comentarios."""
    with owner_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))

    now = datetime.now(UTC)
    ids = {name: uuid4() for name in Seed.__dataclass_fields__}
    with Session(owner_engine) as session, session.begin():
        session.add_all(
            [
                Tenant(
                    id=ids["tenant_a"],
                    slug="tn-andino",
                    legal_name="Textiles Andinos S.A.S.",
                    tax_id="900000001-1",
                    country="CO",
                    city="Medellín",
                ),
                Tenant(
                    id=ids["tenant_b"],
                    slug="tn-pacifico",
                    legal_name="Agroexport Pacífico Ltda.",
                    tax_id="900000002-2",
                    country="CO",
                    city="Cali",
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                Profile(id=ids["ana"], email="ana@cliente-a.test", full_name="Ana Prueba"),
                Profile(id=ids["beto"], email="beto@cliente-a.test", full_name="Beto Prueba"),
                Profile(id=ids["carla"], email="carla@cliente-b.test", full_name="Carla Prueba"),
                Profile(id=ids["dora"], email="dora@multi.test", full_name="Dora Prueba"),
                Profile(id=ids["eva"], email="eva@sin-acceso.test", full_name="Eva Prueba"),
            ]
        )
        session.flush()
        session.add_all(
            [
                TenantMembership(user_id=ids["ana"], tenant_id=ids["tenant_a"], role="client_admin"),
                TenantMembership(user_id=ids["beto"], tenant_id=ids["tenant_a"], role="client_viewer"),
                TenantMembership(user_id=ids["carla"], tenant_id=ids["tenant_b"], role="client_member"),
                TenantMembership(user_id=ids["dora"], tenant_id=ids["tenant_a"], role="client_member"),
                TenantMembership(user_id=ids["dora"], tenant_id=ids["tenant_b"], role="client_member"),
            ]
        )
        session.flush()
        # Clientes finales (nivel B). Membresías de cliente: ana/beto en A1, carla/dora en B1.
        # dora pertenece a A y a B como miembro de tenant, pero NO tiene acceso a A1 ni a A2.
        for name, tenant, legal in (
            ("client_a1", "tenant_a", "Cliente Sintético A1 S.A.S."),
            ("client_a2", "tenant_a", "Cliente Sintético A2 S.A.S."),
            ("client_b1", "tenant_b", "Cliente Sintético B1 Ltda."),
        ):
            session.execute(
                text("INSERT INTO client_accounts (id, tenant_id, legal_name) VALUES (:id, :tenant, :legal)"),
                {"id": ids[name], "tenant": ids[tenant], "legal": legal},
            )
        for user, client, tenant, role in (
            ("ana", "client_a1", "tenant_a", "client_admin"),
            ("beto", "client_a1", "tenant_a", "client_viewer"),
            ("carla", "client_b1", "tenant_b", "client_admin"),
            ("dora", "client_b1", "tenant_b", "client_viewer"),
        ):
            session.execute(
                text(
                    "INSERT INTO client_memberships (tenant_id, client_account_id, user_id, role) "
                    "VALUES (:tenant, :client, :user, :role)"
                ),
                {"tenant": ids[tenant], "client": ids[client], "user": ids[user], "role": role},
            )
        session.add_all(
            [
                OperationRef(
                    id=ids["op_a"],
                    tenant_id=ids["tenant_a"],
                    external_id="LX-A-1",
                    do_number="DO-A-1001",
                    reference="Pedido sintético A",
                    last_known_status="En tránsito",
                ),
                OperationRef(
                    id=ids["op_b"],
                    tenant_id=ids["tenant_b"],
                    external_id="LX-B-1",
                    do_number="DO-B-2001",
                    reference="Pedido sintético B",
                    last_known_status="Recibida",
                ),
                OperationRef(
                    id=ids["op_a2"],
                    tenant_id=ids["tenant_a"],
                    external_id="LX-A-2",
                    do_number="DO-A-1002",
                    reference="Pedido sintético A2",
                    last_known_status="Recibida",
                ),
            ]
        )
        session.flush()  # las claves compuestas no están en el ORM: se fuerza el orden
        # Asignación de cliente final (la columna no está en el ORM).
        for op, client in (("op_a", "client_a1"), ("op_a2", "client_a2"), ("op_b", "client_b1")):
            session.execute(
                text("UPDATE operation_refs SET client_account_id = :client WHERE id = :op"),
                {"client": ids[client], "op": ids[op]},
            )
        session.add_all(
            [
                OperationEvent(
                    id=ids["event_a_public"],
                    tenant_id=ids["tenant_a"],
                    operation_id=ids["op_a"],
                    external_event_id="EV-A-1",
                    event_type="status_change",
                    occurred_at=now,
                    title="Salida de origen",
                    to_status="En tránsito",
                    visibility="client",
                ),
                OperationEvent(
                    id=ids["event_a_internal"],
                    tenant_id=ids["tenant_a"],
                    operation_id=ids["op_a"],
                    external_event_id="EV-A-2",
                    event_type="news",
                    occurred_at=now,
                    title="Nota interna de operaciones",
                    visibility="internal",
                ),
                OperationEvent(
                    id=ids["event_b_public"],
                    tenant_id=ids["tenant_b"],
                    operation_id=ids["op_b"],
                    external_event_id="EV-B-1",
                    event_type="news",
                    occurred_at=now,
                    title="Recepción programada",
                    visibility="client",
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                EventComment(
                    id=ids["comment_a_public"],
                    tenant_id=ids["tenant_a"],
                    operation_id=ids["op_a"],
                    event_id=ids["event_a_public"],
                    author_id=ids["beto"],
                    author_name="Beto Prueba",
                    author_side="client",
                    body="Comentario visible de A.",
                    visibility="client",
                ),
                EventComment(
                    id=ids["comment_a_internal"],
                    tenant_id=ids["tenant_a"],
                    operation_id=ids["op_a"],
                    event_id=ids["event_a_public"],
                    author_id=ids["ana"],
                    author_name="Equipo Logixtic",
                    author_side="operator",
                    body="Nota interna que el cliente no debe ver.",
                    visibility="internal",
                ),
                EventComment(
                    id=ids["comment_b_public"],
                    tenant_id=ids["tenant_b"],
                    operation_id=ids["op_b"],
                    event_id=ids["event_b_public"],
                    author_id=ids["carla"],
                    author_name="Carla Prueba",
                    author_side="client",
                    body="Comentario visible de B.",
                    visibility="client",
                ),
            ]
        )
    yield Seed(**ids)


def mint_token(
    user_id: UUID,
    *,
    secret: str = TEST_SECRET,
    audience: str = "authenticated",
    issuer: str = ISSUER,
    role: str = "authenticated",
    expires_in: timedelta = timedelta(minutes=10),
) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "aud": audience,
        "iss": issuer,
        "role": role,
        "email": "prueba@sintetico.test",
        "iat": int(now.timestamp()),
        "exp": int((now + expires_in).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def app(test_settings: Settings, owner_engine: Engine, seed: Seed) -> FastAPI:
    return create_app(test_settings, database_engine=owner_engine)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
