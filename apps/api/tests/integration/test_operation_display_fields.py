"""Contrato de presentación: los campos nuevos existen y valen null cuando no hay información."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.main import create_app
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration

NEW_FIELDS = (
    "origin_name",
    "destination_name",
    "transport_type",
    "etd",
    "eta",
    "booking_number",
    "carrier_name",
    "responsible_name",
    "pending_client_response",
)


@pytest.fixture
def client(test_settings: Settings, owner_engine: Engine, seed: Seed) -> TestClient:
    app: FastAPI = create_app(test_settings, database_engine=owner_engine)
    with TestClient(app) as c:
        yield c


def test_operation_contract_exposes_presentation_fields_as_null_when_unknown(client, seed) -> None:
    r = client.get(
        "/api/v1/operations",
        headers={"Authorization": f"Bearer {mint_token(seed.ana)}", "X-Tenant-Id": str(seed.tenant_a)},
    )
    assert r.status_code == 200
    items = r.json()
    assert items, "el cliente debe ver sus operaciones"
    for field in NEW_FIELDS:
        assert field in items[0]
        assert items[0][field] is None


def test_presentation_fields_round_trip_from_postgresql(client, seed, owner_engine: Engine) -> None:
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE operation_refs SET origin_name = 'Origen de prueba', eta = DATE '2026-12-01', "
                "pending_client_response = true WHERE id = :o"
            ),
            {"o": seed.op_a},
        )
    r = client.get(
        f"/api/v1/operations/{seed.op_a}",
        headers={"Authorization": f"Bearer {mint_token(seed.ana)}", "X-Tenant-Id": str(seed.tenant_a)},
    )
    body = r.json()
    assert body["origin_name"] == "Origen de prueba"
    assert body["eta"] == "2026-12-01"
    assert body["pending_client_response"] is True
    assert body["etd"] is None
