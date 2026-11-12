"""Pruebas unitarias del servicio del frontend desde FastAPI. No requieren base de datos.

Usan un directorio `dist` temporal con contenido sintético.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.core.config import Settings
from app.main import create_app

INDEX_MARKER = "<!doctype html><title>PORTAL-SINTETICO</title>"
SECRET = "SECRETO-DE-PRUEBA-NO-DEBE-SALIR"  # noqa: S105 - valor sintético para comprobar que no se filtra


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    root = tmp_path / "web" / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(INDEX_MARKER, encoding="utf-8")
    (root / "assets" / "app-abc123.js").write_text("console.log('ok')", encoding="utf-8")
    (root / ".env").write_text(f"CLAVE={SECRET}", encoding="utf-8")
    (tmp_path / "web" / "secret.txt").write_text(SECRET, encoding="utf-8")
    return root


def _client(dist: Path | None) -> TestClient:
    settings = Settings(
        _env_file=None,
        web_dist_dir=str(dist) if dist else None,
        database_url="postgresql+psycopg://u@127.0.0.1:1/none",
    )
    engine = create_engine(settings.database_url, future=True)
    return TestClient(create_app(settings, database_engine=engine))


def test_spa_routes_return_index_html(dist: Path) -> None:
    client = _client(dist)
    for path in (
        "/login",
        "/operaciones",
        "/operaciones/3f9c1a2e-0000-4000-8000-000000000001",
        "/documentos",
    ):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.headers["content-type"].startswith("text/html"), path
        assert INDEX_MARKER in response.text, path


def test_static_assets_are_served(dist: Path) -> None:
    response = _client(dist).get("/assets/app-abc123.js")
    assert response.status_code == 200
    assert "console.log" in response.text


def test_unknown_api_route_is_json_404_never_html(dist: Path) -> None:
    client = _client(dist)
    for path in ("/api/v1/no-existe", "/api", "/api/v1/operations/x/otra-cosa"):
        response = client.get(path)
        assert response.status_code == 404, path
        assert response.headers["content-type"].startswith("application/json"), path
        assert response.json()["error"]["code"] == "not_found", path
        assert INDEX_MARKER not in response.text, path


def test_health_stays_json(dist: Path) -> None:
    response = _client(dist).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_hidden_files_and_traversal_never_leak_content(dist: Path) -> None:
    client = _client(dist)
    for path in ("/.env", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt"):
        response = client.get(path)
        assert SECRET not in response.text, path


def test_reserved_prefix_matches_whole_segment_only(dist: Path) -> None:
    # "documentos" es una ruta del portal, no la documentación de la API.
    assert INDEX_MARKER in _client(dist).get("/documentos").text


def test_without_build_there_is_no_spa(dist: Path) -> None:
    response = _client(None).get("/login")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
