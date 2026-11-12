"""Aprovisionamiento del bucket de documentos con transporte simulado (sin red)."""

from __future__ import annotations

import json

import httpx

from app.services.documents import ALLOWED_TYPES, MAX_BYTES
from app.services.storage import BUCKET
from app.services.storage_bucket import ensure_bucket

BASE = "https://proyecto-prueba.supabase.test"
KEY = "clave-sintetica-de-prueba-000"  # noqa: S105 - clave ficticia de prueba


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _correct_bucket() -> dict:
    return {
        "id": BUCKET,
        "public": False,
        "file_size_limit": MAX_BYTES,
        "allowed_mime_types": sorted(ALLOWED_TYPES),
    }


def test_bucket_existente_correcto_no_se_modifica() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        return httpx.Response(200, json=_correct_bucket())

    result = ensure_bucket(_client(handler), BASE, KEY, apply=True)
    assert result.action == "exists_ok"
    assert calls == [f"GET /storage/v1/bucket/{BUCKET}"]


def test_bucket_publico_se_informa_y_no_se_cambia() -> None:
    bucket = _correct_bucket() | {"public": True}
    methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        methods.append(request.method)
        return httpx.Response(200, json=bucket)

    result = ensure_bucket(_client(handler), BASE, KEY, apply=True)
    assert result.action == "exists_mismatch"
    assert any("público" in d for d in result.differences)
    assert methods == ["GET"]  # nunca PUT ni POST sobre un bucket existente


def test_limite_o_tipos_distintos_se_informan() -> None:
    bucket = _correct_bucket() | {"file_size_limit": 1024, "allowed_mime_types": ["text/plain"]}
    result = ensure_bucket(_client(lambda r: httpx.Response(200, json=bucket)), BASE, KEY, apply=False)
    assert result.action == "exists_mismatch" and len(result.differences) == 2


def test_sin_apply_no_crea_el_bucket() -> None:
    methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        methods.append(request.method)
        return httpx.Response(404, json={"message": "Bucket not found"})

    result = ensure_bucket(_client(handler), BASE, KEY, apply=False)
    assert result.action == "would_create"
    assert methods == ["GET"]


def test_con_apply_crea_bucket_privado_con_limites_y_tipos() -> None:
    sent: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(404, json={"message": "Bucket not found"})
        sent["body"] = json.loads(request.content)
        return httpx.Response(200, json={"name": BUCKET})

    result = ensure_bucket(_client(handler), BASE, KEY, apply=True)
    assert result.action == "created"
    assert sent["body"]["id"] == BUCKET
    assert sent["body"]["public"] is False
    assert sent["body"]["file_size_limit"] == MAX_BYTES
    assert sent["body"]["allowed_mime_types"] == sorted(ALLOWED_TYPES)


def test_errores_del_servidor_no_exponen_su_respuesta() -> None:
    result = ensure_bucket(
        _client(lambda r: httpx.Response(500, text="secreto interno")), BASE, KEY, apply=True
    )
    assert result.action == "error" and result.status == 500
    assert "secreto" not in repr(result)


def test_la_clave_viaja_solo_en_cabeceras_de_la_peticion() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_correct_bucket())

    ensure_bucket(_client(handler), BASE, KEY, apply=False)
    assert seen[0].headers["apikey"] == KEY
    assert KEY not in str(seen[0].url)
