"""Pruebas unitarias del contrato OpenAPI: las rutas protegidas declaran sus errores (sin base de datos)."""

from __future__ import annotations

from app.core.config import Settings
from app.main import create_app

PROTECTED_PREFIX = "/api/v1/"


def _spec() -> dict:
    app = create_app(Settings(_env_file=None, database_url="postgresql+psycopg://u:p@127.0.0.1:1/none"))
    return app.openapi()


def test_every_protected_route_documents_auth_errors() -> None:
    spec = _spec()
    for path, operations in spec["paths"].items():
        if not path.startswith(PROTECTED_PREFIX):
            continue
        for method, operation in operations.items():
            responses = operation["responses"]
            for status in ("401", "403", "503"):
                assert status in responses, f"{method.upper()} {path} no documenta {status}"


def test_error_responses_use_the_error_envelope() -> None:
    spec = _spec()
    schema = spec["paths"]["/api/v1/me"]["get"]["responses"]["401"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/ErrorEnvelope"}


def test_health_is_public_and_has_no_auth_errors() -> None:
    responses = _spec()["paths"]["/health"]["get"]["responses"]
    assert "401" not in responses
