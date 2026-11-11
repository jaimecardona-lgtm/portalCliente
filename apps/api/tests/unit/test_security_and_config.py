"""Pruebas unitarias: configuración y verificación de tokens. No requieren base de datos."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.core.errors import InvalidToken
from app.core.security import SupabaseTokenVerifier, build_token_verifier

SECRET = "solo-para-pruebas-0123456789abcdefghijklmnop"  # noqa: S105 - secreto de prueba
URL = "https://proyecto-prueba.supabase.test"
ISSUER = f"{URL}/auth/v1"


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "supabase_url": URL,
        "supabase_jwt_secret": SecretStr(SECRET),
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _token(**claims: object) -> str:
    now = datetime.now(UTC)
    payload: dict[str, object] = {
        "sub": str(uuid4()),
        "aud": "authenticated",
        "iss": ISSUER,
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    payload.update(claims)
    return jwt.encode({k: v for k, v in payload.items() if v is not None}, SECRET, algorithm="HS256")


# --- Configuración ---------------------------------------------------------------------------------


def test_wildcard_cors_origin_is_rejected() -> None:
    with pytest.raises(ValidationError):
        _settings(cors_allowed_origins=["*"])


def test_cors_origins_are_normalised() -> None:
    settings = _settings(cors_allowed_origins=[" https://portal.example.test/ ", ""])
    assert settings.cors_allowed_origins == ["https://portal.example.test"]


def test_production_requires_real_auth_configuration() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production")


def test_production_disables_docs_by_default() -> None:
    settings = _settings(app_env="production")
    assert settings.docs_enabled is False


def test_production_docs_require_explicit_opt_in() -> None:
    settings = _settings(app_env="production", docs_enabled=True)
    assert settings.docs_enabled is True


def test_development_enables_docs_by_default() -> None:
    settings = _settings(app_env="development")
    assert settings.docs_enabled is True


def test_auth_not_configured_without_supabase_values() -> None:
    settings = Settings(_env_file=None)
    assert settings.auth_configured is False
    assert build_token_verifier(settings) is None


def test_jwt_leeway_is_bounded() -> None:
    with pytest.raises(ValidationError):
        _settings(jwt_leeway_seconds=600)


def test_secret_is_not_shown_in_repr() -> None:
    assert SECRET not in repr(_settings())


# --- Verificación de tokens ------------------------------------------------------------------------


def test_valid_token_yields_subject() -> None:
    user_id = uuid4()
    verifier = SupabaseTokenVerifier(_settings())
    claims = verifier.verify(_token(sub=str(user_id)))
    assert claims.subject == user_id


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"aud": "otra-audiencia"},
        {"iss": "https://otro-proyecto.supabase.test/auth/v1"},
        {"role": "anon"},
        {"exp": int((datetime.now(UTC) - timedelta(minutes=5)).timestamp())},
        {"sub": "no-es-uuid"},
        {"sub": None},
    ],
)
def test_invalid_claims_are_rejected(token_kwargs: dict[str, object]) -> None:
    verifier = SupabaseTokenVerifier(_settings())
    with pytest.raises(InvalidToken):
        verifier.verify(_token(**token_kwargs))


def test_token_signed_with_other_secret_is_rejected() -> None:
    forged = jwt.encode(
        {
            "sub": str(uuid4()),
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        },
        "otro-secreto-que-no-conocemos-0123456789abcdef",
        algorithm="HS256",
    )
    with pytest.raises(InvalidToken):
        SupabaseTokenVerifier(_settings()).verify(forged)


def test_unsigned_token_is_rejected() -> None:
    unsigned = jwt.encode(
        {
            "sub": str(uuid4()),
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        },
        key="",
        algorithm="none",
    )
    with pytest.raises(InvalidToken):
        SupabaseTokenVerifier(_settings()).verify(unsigned)


def test_oversized_or_empty_token_is_rejected() -> None:
    verifier = SupabaseTokenVerifier(_settings())
    with pytest.raises(InvalidToken):
        verifier.verify("")
    with pytest.raises(InvalidToken):
        verifier.verify("a" * 8193)
