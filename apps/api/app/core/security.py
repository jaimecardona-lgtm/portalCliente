"""Verificación de tokens de acceso de Supabase Auth.

Responsabilidad: comprobar firma, emisor, audiencia, caducidad y rol de un JWT, y devolver las
reclamaciones mínimas (`sub`, `email`, `exp`). No consulta la base de datos: eso corresponde a
`app.services.access`, que resuelve la membresía.

Algoritmos:

- Si `SUPABASE_JWKS_URL` está configurado: RS256 o ES256 con la clave pública indicada por `kid`.
- Si solo hay `SUPABASE_JWT_SECRET`: HS256 con ese secreto.
- Si no hay ninguno: `build_token_verifier` devuelve None y la API responde 503 (`auth_not_configured`).
  Nunca se acepta un token sin verificar firma.

Errores: cualquier fallo de verificación produce `InvalidToken` (401) sin detallar la causa.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

import jwt
from jwt import PyJWKClient

from app.core.config import Settings
from app.core.errors import InvalidToken

_ASYMMETRIC = ["RS256", "ES256"]
_SYMMETRIC = ["HS256"]


@dataclass(frozen=True)
class TokenClaims:
    """Reclamaciones validadas de un token de acceso."""

    subject: UUID
    email: str | None
    expires_at: datetime
    # Último inicio de sesión con contraseña (claim amr). None si el token no lo declara.
    password_authenticated_at: datetime | None = None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> TokenClaims: ...


class SupabaseTokenVerifier:
    """Verifica tokens emitidos por Supabase Auth para la audiencia y el emisor configurados."""

    def __init__(self, settings: Settings, jwks_client: PyJWKClient | None = None) -> None:
        self._audience = settings.supabase_jwt_audience
        self._issuer = settings.supabase_issuer
        self._leeway = settings.jwt_leeway_seconds
        self._secret = (
            settings.supabase_jwt_secret.get_secret_value() if settings.supabase_jwt_secret else None
        )
        if jwks_client is not None:
            self._jwks = jwks_client
        elif settings.supabase_jwks_url:
            self._jwks = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
        else:
            self._jwks = None

    def verify(self, token: str) -> TokenClaims:
        if not token or len(token) > 8192:
            raise InvalidToken()
        try:
            key, algorithms = self._resolve_key(token)
            payload: dict[str, Any] = jwt.decode(
                token,
                key=key,
                algorithms=algorithms,
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._leeway,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidToken() from exc

        # Los tokens de usuarios autenticados llevan role=authenticated. Los de anónimo u otros no sirven.
        if payload.get("role") != "authenticated":
            raise InvalidToken()
        try:
            subject = UUID(str(payload["sub"]))
        except (KeyError, ValueError) as exc:
            raise InvalidToken() from exc
        email = payload.get("email")
        return TokenClaims(
            subject=subject,
            email=email if isinstance(email, str) else None,
            expires_at=datetime.fromtimestamp(int(payload["exp"]), tz=UTC),
            password_authenticated_at=_password_time(payload),
        )

    def _resolve_key(self, token: str) -> tuple[Any, list[str]]:
        if self._jwks is not None:
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            return signing_key.key, _ASYMMETRIC
        if self._secret is not None:
            return self._secret, _SYMMETRIC
        raise InvalidToken()


def build_token_verifier(settings: Settings) -> TokenVerifier | None:
    """Devuelve el verificador configurado, o None si falta configuración de autenticación."""
    if not settings.auth_configured:
        return None
    return SupabaseTokenVerifier(settings)


def _password_time(payload: dict[str, Any]) -> datetime | None:
    """Momento del último inicio de sesión con contraseña según el claim amr de Supabase."""
    amr = payload.get("amr")
    if not isinstance(amr, list):
        return None
    times = [
        int(item["timestamp"])
        for item in amr
        if isinstance(item, dict)
        and item.get("method") == "password"
        and isinstance(item.get("timestamp"), (int, float))
    ]
    return datetime.fromtimestamp(max(times), tz=UTC) if times else None
