"""Pruebas HTTP de integración: autenticación, aislamiento entre empresas y reglas de comentarios."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.main import create_app
from tests.conftest import Seed, mint_token

pytestmark = pytest.mark.integration


def _h(user_id, tenant=None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {mint_token(user_id)}"}
    if tenant is not None:
        headers["X-Tenant-Id"] = str(tenant)
    return headers


def _error_code(response) -> str:
    return response.json()["error"]["code"]


# --- Autenticación --------------------------------------------------------------------------------


def test_health_is_public(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_missing_token_is_401(client: TestClient) -> None:
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert _error_code(response) == "authentication_required"


def test_wrong_scheme_is_401(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/me", headers={"Authorization": f"Basic {mint_token(seed.ana)}"})
    assert response.status_code == 401


def test_anon_role_token_is_401(client: TestClient, seed: Seed) -> None:
    token = mint_token(seed.ana, role="anon")
    response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert _error_code(response) == "invalid_token"


def test_expired_token_is_401(client: TestClient, seed: Seed) -> None:
    token = mint_token(seed.ana, expires_in=timedelta(minutes=-10))
    response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_token_from_other_issuer_is_401(client: TestClient, seed: Seed) -> None:
    token = mint_token(seed.ana, issuer="https://otro.supabase.test/auth/v1")
    response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_user_without_membership_is_403(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/me", headers=_h(seed.eva))
    assert response.status_code == 403
    assert _error_code(response) == "no_tenant_membership"


def test_unconfigured_auth_answers_503_not_a_fake_login(seed: Seed, owner_engine: Engine) -> None:
    from app.core.config import Settings

    settings = Settings(_env_file=None, database_url=str(owner_engine.url))
    app: FastAPI = create_app(settings, database_engine=owner_engine)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/api/v1/me", headers={"Authorization": "Bearer cualquier-cosa"})
    assert response.status_code == 503
    assert _error_code(response) == "auth_not_configured"


# --- Selección de empresa --------------------------------------------------------------------------


def test_single_membership_selects_tenant_without_header(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/me", headers=_h(seed.ana))
    assert response.status_code == 200
    body = response.json()
    assert body["tenant"]["id"] == str(seed.tenant_a)
    assert body["role"] == "client_admin"
    assert body["can_comment"] is True


def test_multi_membership_requires_explicit_tenant(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/me", headers=_h(seed.dora))
    assert response.status_code == 400
    assert _error_code(response) == "tenant_selection_required"


def test_multi_membership_user_can_choose_each_own_tenant(client: TestClient, seed: Seed) -> None:
    a = client.get("/api/v1/me", headers=_h(seed.dora, seed.tenant_a)).json()
    b = client.get("/api/v1/me", headers=_h(seed.dora, seed.tenant_b)).json()
    assert a["tenant"]["id"] == str(seed.tenant_a)
    assert b["tenant"]["id"] == str(seed.tenant_b)


def test_choosing_foreign_tenant_is_403(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/me", headers=_h(seed.ana, seed.tenant_b))
    assert response.status_code == 403
    assert _error_code(response) == "tenant_not_authorized"


def test_malformed_tenant_header_is_400(client: TestClient, seed: Seed) -> None:
    headers = {"Authorization": f"Bearer {mint_token(seed.ana)}", "X-Tenant-Id": "no-es-uuid"}
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 400
    assert _error_code(response) == "invalid_tenant_header"


def test_suspended_tenant_denies_access(client: TestClient, seed: Seed, owner_engine: Engine) -> None:
    with owner_engine.begin() as conn:
        conn.execute(text("UPDATE tenants SET status = 'suspended' WHERE id = :t"), {"t": seed.tenant_a})
    response = client.get("/api/v1/me", headers=_h(seed.ana))
    assert response.status_code == 403
    assert _error_code(response) == "tenant_inactive"


def test_disabled_profile_denies_access(client: TestClient, seed: Seed, owner_engine: Engine) -> None:
    with owner_engine.begin() as conn:
        conn.execute(text("UPDATE profiles SET status = 'disabled' WHERE id = :u"), {"u": seed.ana})
    response = client.get("/api/v1/me", headers=_h(seed.ana))
    assert response.status_code == 403
    assert _error_code(response) == "profile_inactive"


# --- Operaciones y eventos: aislamiento entre empresas ---------------------------------------------


def test_operation_list_contains_only_own_tenant(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/operations", headers=_h(seed.ana))
    assert response.status_code == 200
    assert [op["id"] for op in response.json()] == [str(seed.op_a)]


def test_foreign_operation_id_answers_404_like_missing(client: TestClient, seed: Seed) -> None:
    foreign = client.get(f"/api/v1/operations/{seed.op_b}", headers=_h(seed.ana))
    missing = client.get(f"/api/v1/operations/{uuid4()}", headers=_h(seed.ana))
    assert foreign.status_code == missing.status_code == 404
    assert _error_code(foreign) == _error_code(missing) == "operation_not_found"
    assert foreign.json()["error"]["message"] == missing.json()["error"]["message"]


def test_events_exclude_internal_visibility(client: TestClient, seed: Seed) -> None:
    response = client.get(f"/api/v1/operations/{seed.op_a}/events", headers=_h(seed.ana))
    assert response.status_code == 200
    ids = [e["id"] for e in response.json()]
    assert ids == [str(seed.event_a_public)]


def test_events_of_foreign_operation_are_404(client: TestClient, seed: Seed) -> None:
    response = client.get(f"/api/v1/operations/{seed.op_b}/events", headers=_h(seed.ana))
    assert response.status_code == 404


def test_response_never_contains_storage_or_external_identifiers(client: TestClient, seed: Seed) -> None:
    body = client.get(f"/api/v1/operations/{seed.op_a}", headers=_h(seed.ana)).text
    assert "LX-A-1" not in body
    assert "external_id" not in body
    assert "storage_path" not in body


# --- Comentarios -----------------------------------------------------------------------------------


def test_comment_list_excludes_internal_comments(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.get(url, headers=_h(seed.ana))
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()]
    assert ids == [str(seed.comment_a_public)]


def test_comment_on_foreign_event_is_404(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_b_public}/comments"
    response = client.get(url, headers=_h(seed.ana))
    assert response.status_code == 404
    assert _error_code(response) == "event_not_found"


def test_create_comment_sets_author_and_side_on_server(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.post(url, headers=_h(seed.ana), json={"body": "   Hola, ¿cuándo llega?   "})
    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "Hola, ¿cuándo llega?"
    assert body["author_name"] == "Ana Prueba"
    assert body["author_side"] == "client"
    assert body["parent_comment_id"] is None
    assert "author_id" not in body


def test_create_comment_does_not_change_operation_status(
    client: TestClient, seed: Seed, owner_engine: Engine
) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    before = client.get(f"/api/v1/operations/{seed.op_a}", headers=_h(seed.ana)).json()
    events_before = client.get(f"/api/v1/operations/{seed.op_a}/events", headers=_h(seed.ana)).json()
    assert (
        client.post(url, headers=_h(seed.ana), json={"body": "Mensaje sin cambio de estado"}).status_code
        == 201
    )
    after = client.get(f"/api/v1/operations/{seed.op_a}", headers=_h(seed.ana)).json()
    events_after = client.get(f"/api/v1/operations/{seed.op_a}/events", headers=_h(seed.ana)).json()
    assert after["last_known_status"] == before["last_known_status"]
    assert events_after == events_before


def test_viewer_can_read_but_not_comment(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    assert client.get(url, headers=_h(seed.beto)).status_code == 200
    response = client.post(url, headers=_h(seed.beto), json={"body": "Intento de comentario"})
    assert response.status_code == 403
    assert _error_code(response) == "role_cannot_comment"


def test_cannot_comment_on_foreign_event_even_with_own_operation(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_b_public}/comments"
    response = client.post(url, headers=_h(seed.ana), json={"body": "Cruce entre empresas"})
    assert response.status_code == 404


def test_cannot_comment_on_foreign_operation_with_own_event(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_b}/events/{seed.event_a_public}/comments"
    response = client.post(url, headers=_h(seed.ana), json={"body": "Cruce entre empresas"})
    assert response.status_code == 404


def test_reply_to_visible_comment_keeps_parent(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.post(
        url,
        headers=_h(seed.ana),
        json={"body": "Respondo al comentario anterior.", "parent_comment_id": str(seed.comment_a_public)},
    )
    assert response.status_code == 201
    assert response.json()["parent_comment_id"] == str(seed.comment_a_public)


def test_reply_to_internal_comment_is_404(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.post(
        url,
        headers=_h(seed.ana),
        json={
            "body": "Intento de responder a una nota interna.",
            "parent_comment_id": str(seed.comment_a_internal),
        },
    )
    assert response.status_code == 404
    assert _error_code(response) == "parent_comment_not_found"


def test_reply_to_comment_of_other_tenant_is_404(client: TestClient, seed: Seed) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.post(
        url,
        headers=_h(seed.ana),
        json={
            "body": "Intento de responder a otra empresa.",
            "parent_comment_id": str(seed.comment_b_public),
        },
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"body": ""},
        {"body": "   "},
        {"body": "x" * 2001},
        {"body": "ok", "author_id": "00000000-0000-0000-0000-000000000000"},
        {"body": "ok", "author_side": "operator"},
        {"body": "ok", "tenant_id": "00000000-0000-0000-0000-000000000000"},
    ],
)
def test_comment_payload_rules(client: TestClient, seed: Seed, payload: dict) -> None:
    url = f"/api/v1/operations/{seed.op_a}/events/{seed.event_a_public}/comments"
    response = client.post(url, headers=_h(seed.ana), json=payload)
    assert response.status_code == 422


def test_error_envelope_has_stable_shape(client: TestClient, seed: Seed) -> None:
    response = client.get("/api/v1/operations", headers={"Authorization": "Bearer x"})
    error = response.json()["error"]
    assert set(error) == {"code", "message", "request_id"}
    assert response.headers.get("X-Request-ID") == error["request_id"]


def test_page_limit_is_bounded(client: TestClient, seed: Seed) -> None:
    assert client.get("/api/v1/operations?limit=500", headers=_h(seed.ana)).status_code == 422
    assert client.get("/api/v1/operations?limit=0", headers=_h(seed.ana)).status_code == 422
