"""Catálogo de descubrimiento de tenants (migración 20261112000100): aislamiento y contenido.

Los nombres observados NO son identificadores oficiales ni conceden acceso. Estas pruebas fijan que el portal
no puede leerlos, que ninguno está verificado y que la reconciliación conserva los nueve registros.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError

from tests.conftest import Seed

pytestmark = pytest.mark.integration

OBSERVED = {
    "CLM CARGO",
    "Capacity Tenant 01",
    "Capacity Tenant 02",
    "Capacity Tenant 03",
    "Demo Logixtic",
    "D´MAG LOGISTIC SAS",
    "Global Trade Business",
    "ITALIAN SHIPPING",
    "Line Cargo S.A.S",
}


@contextmanager
def _denied() -> Iterator[None]:
    with pytest.raises(DBAPIError) as info:
        yield
    assert info.value.orig is not None
    assert info.value.orig.sqlstate == "42501"


def _as_user(conn, user_id: uuid.UUID | None) -> None:
    conn.execute(text("SET LOCAL ROLE portal_app"))
    conn.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id or "")})


def test_nine_observed_names_are_present_and_none_is_verified(owner_engine: Engine) -> None:
    with owner_engine.connect() as conn:
        names = {
            r[0]
            for r in conn.execute(text("SELECT observed_label FROM public.logixtic_tenant_discovery")).all()
        }
        statuses = {
            r[0]
            for r in conn.execute(
                text("SELECT DISTINCT verification_status FROM public.logixtic_tenant_discovery")
            ).all()
        }
        with_external_id = conn.execute(
            text("SELECT count(*) FROM public.logixtic_tenant_discovery WHERE external_tenant_id IS NOT NULL")
        ).scalar()
    assert names == OBSERVED
    assert statuses == {"unverified"}
    assert with_external_id == 0


def test_catalog_has_rls_enabled_and_no_policies(owner_engine: Engine) -> None:
    with owner_engine.connect() as conn:
        rls = conn.execute(
            text(
                "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.logixtic_tenant_discovery'::regclass"
            )
        ).scalar()
        policies = conn.execute(
            text(
                "SELECT count(*) FROM pg_policies "
                "WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery'"
            )
        ).scalar()
    assert rls is True
    assert policies == 0


def test_portal_role_cannot_read_the_catalog(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)
        with _denied():
            conn.execute(text("SELECT count(*) FROM public.logixtic_tenant_discovery"))


def test_catalog_is_not_a_source_of_tenant_access(owner_engine: Engine, seed: Seed) -> None:
    """Un nombre observado igual al nombre de una empresa del portal no concede ningún acceso."""
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE tenants SET legal_name = 'CLM CARGO' WHERE id = :t"),
            {"t": seed.tenant_b},
        )
    with owner_engine.begin() as conn:
        _as_user(conn, seed.ana)  # ana es de A1; el nombre coincide con una empresa de B
        ops = {r[0] for r in conn.execute(text("SELECT id FROM operation_refs")).all()}
    assert seed.op_b not in ops
    assert ops == {seed.op_a}
