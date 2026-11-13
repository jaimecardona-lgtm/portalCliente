"""Logix: clasificación, respuestas deterministas, ruta general y límites. Sin base de datos ni red."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import httpx
from pydantic import SecretStr

from app.core.config import Settings
from app.integrations import openrouter
from app.services import logix


def _op(do: str, status: str | None, *, synced: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        do_number=do,
        reference=f"REF-{do}",
        last_known_status=status,
        last_synced_at=datetime(2026, 11, 10, tzinfo=UTC) if synced else None,
    )


def _settings(**overrides) -> Settings:
    base = dict(
        _env_file=None,
        app_env="test",
        database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none",
        supabase_url="https://example.supabase.co",
        supabase_jwt_secret=SecretStr("x" * 32),
        cors_allowed_origins=["http://127.0.0.1:5173"],
    )
    base.update(overrides)
    return Settings(**base)


def test_private_questions_are_routed_to_the_database_not_the_model() -> None:
    assert logix.is_private("¿Cuántas operaciones tengo?")
    assert logix.is_private("¿En qué estado está DO-26-0412?")
    assert logix.is_private("¿Tengo documentos vencidos?")
    assert not logix.is_private("¿Qué es un incoterm FOB?")


def test_no_operations_is_reported_as_absence_not_as_zero_or_error() -> None:
    answer = logix.answer_private("¿Cuántas operaciones tengo?", [])
    assert answer.kind == "deterministic"
    assert "No hay operaciones sincronizadas" in answer.text


def test_do_number_answer_cites_the_record_and_missing_do_is_explicit() -> None:
    ops = [_op("DO-26-0412", "En tránsito")]
    found = logix.answer_private("¿Qué estado tiene DO-26-0412?", ops)
    assert "DO-26-0412: estado En tránsito" in found.text
    assert found.sources == ("DO-26-0412",)
    missing = logix.answer_private("¿Qué estado tiene DO-26-9999?", ops)
    assert "No encontré la operación DO-26-9999" in missing.text
    assert missing.sources == ()


def test_summary_counts_only_persisted_operations() -> None:
    ops = [_op("DO-26-0001", "Creado"), _op("DO-26-0002", "Entregado"), _op("DO-26-0003", None, synced=False)]
    answer = logix.answer_private("¿Cuántas operaciones tengo?", ops)
    assert "sincronizadas de la empresa activa: 3" in answer.text
    assert "Sin cerrar ni entregar: 2" in answer.text


def test_general_questions_do_not_call_the_provider_when_disabled() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={})

    answer = logix.answer_general("¿Qué es un incoterm?", _settings(), transport=httpx.MockTransport(handler))
    assert answer.kind == "unavailable"
    assert calls == []


def test_enabled_general_path_sends_only_the_question_and_system_rules() -> None:
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        sent.append(json.loads(request.content))
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "Un incoterm define responsabilidades."}}]}
        )

    settings = _settings(
        logix_ai_enabled=True,
        logix_external_processing_authorized=True,
        openrouter_api_key=SecretStr("sk-or-v1-prueba-sintetica"),
        openrouter_model="modelo/prueba",
    )
    answer = logix.answer_general("¿Qué es un incoterm?", settings, transport=httpx.MockTransport(handler))
    assert answer.kind == "model"
    assert answer.text.startswith("Un incoterm")
    messages = sent[0]["messages"]
    assert [m["role"] for m in messages] == ["system", "user"]
    assert messages[1]["content"] == "¿Qué es un incoterm?"


def test_provider_failure_is_distinct_from_no_data_and_leaks_no_details() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "detalle interno del proveedor"})

    settings = _settings(
        logix_ai_enabled=True,
        logix_external_processing_authorized=True,
        openrouter_api_key=SecretStr("sk-or-v1-prueba-sintetica"),
        openrouter_model="modelo/prueba",
    )
    answer = logix.answer_general("¿Qué es un incoterm?", settings, transport=httpx.MockTransport(handler))
    assert answer.kind == "provider_failure"
    assert "detalle interno" not in answer.text
    assert "sk-or-v1" not in answer.text


def test_provider_timeout_maps_to_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("tiempo agotado", request=request)

    try:
        openrouter.chat_completion(
            base_url="https://openrouter.ai/api/v1",
            api_key="k",
            model="m",
            messages=[],
            max_output_tokens=10,
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
    except openrouter.ProviderError as exc:
        assert str(exc) == "timeout"
    else:  # pragma: no cover - el test falla si no se lanza
        raise AssertionError("se esperaba ProviderError")


def test_rate_limiter_blocks_after_the_hourly_limit_and_resets_after_an_hour() -> None:
    now = [0.0]
    limiter = logix.RateLimiter(clock=lambda: now[0])
    user = uuid4()
    assert limiter.allow(user, 2) and limiter.allow(user, 2)
    assert not limiter.allow(user, 2)
    now[0] = 3601.0
    assert limiter.allow(user, 2)
