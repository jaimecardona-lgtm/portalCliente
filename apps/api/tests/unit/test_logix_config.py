"""Configuración del agente Logix: valores por defecto seguros y validaciones de autorización.

No llaman a OpenRouter. Verifican que Logix no se activa sin autorización, clave ni modelo verificado.
"""

from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings

KEY = "sk-or-sintetica-no-real-0123456789"  # noqa: S105 - clave ficticia de prueba
MODEL = "modelo-verificado-prueba"
EMBED = "embedding-verificado-prueba"


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {"_env_file": None}
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_por_defecto_logix_y_rag_estan_desactivados_sin_modelo() -> None:
    s = _settings()
    assert s.logix_ai_enabled is False
    assert s.logix_rag_enabled is False
    assert s.logix_external_processing_authorized is False
    assert s.openrouter_api_key is None
    assert s.openrouter_model is None
    assert s.openrouter_embedding_model is None


def test_la_clave_no_aparece_en_repr_ni_en_el_modelo() -> None:
    s = _settings(openrouter_api_key=SecretStr(KEY))
    assert KEY not in repr(s)
    assert KEY not in s.model_dump_json()


def test_activar_logix_sin_autorizacion_empresarial_falla() -> None:
    with pytest.raises(ValidationError, match="AUTHORIZED"):
        _settings(logix_ai_enabled=True, openrouter_api_key=SecretStr(KEY), openrouter_model=MODEL)


def test_activar_logix_sin_clave_falla() -> None:
    with pytest.raises(ValidationError, match="OPENROUTER_API_KEY"):
        _settings(
            logix_ai_enabled=True,
            logix_external_processing_authorized=True,
            openrouter_model=MODEL,
        )


def test_activar_logix_sin_modelo_verificado_falla() -> None:
    with pytest.raises(ValidationError, match="OPENROUTER_MODEL"):
        _settings(
            logix_ai_enabled=True,
            logix_external_processing_authorized=True,
            openrouter_api_key=SecretStr(KEY),
        )


def test_activar_logix_con_todo_lo_necesario_es_valido() -> None:
    s = _settings(
        logix_ai_enabled=True,
        logix_external_processing_authorized=True,
        openrouter_api_key=SecretStr(KEY),
        openrouter_model=MODEL,
    )
    assert s.logix_ai_enabled is True
    assert s.logix_rag_enabled is False


def test_rag_requiere_logix_y_modelo_de_embeddings() -> None:
    with pytest.raises(ValidationError, match="LOGIX_AI_ENABLED"):
        _settings(logix_rag_enabled=True)
    with pytest.raises(ValidationError, match="OPENROUTER_EMBEDDING_MODEL"):
        _settings(
            logix_ai_enabled=True,
            logix_external_processing_authorized=True,
            openrouter_api_key=SecretStr(KEY),
            openrouter_model=MODEL,
            logix_rag_enabled=True,
        )


def test_la_url_de_openrouter_debe_ser_https_y_sin_barra_final() -> None:
    with pytest.raises(ValidationError, match="https"):
        _settings(openrouter_base_url="http://openrouter.example.test/api/v1")
    assert _settings(openrouter_base_url="https://openrouter.ai/api/v1/").openrouter_base_url == (
        "https://openrouter.ai/api/v1"
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("logix_max_input_tokens", 10),
        ("logix_max_output_tokens", 99999),
        ("logix_timeout_seconds", 0),
        ("logix_max_requests_per_user_per_hour", 0),
        ("logix_max_retrieved_chunks", 500),
    ],
)
def test_los_limites_tienen_rangos_acotados(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        _settings(**{field: value})
