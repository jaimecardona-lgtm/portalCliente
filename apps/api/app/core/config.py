"""Configuración de la API a partir de variables de entorno.

Responsabilidad: leer y validar la configuración una sola vez al arrancar.

Contrato de entrada: variables de entorno o un archivo `.env` local (no versionado). Ver `.env.example`.
Restricciones importantes:

- Ningún secreto tiene valor por defecto. Si falta la configuración de Supabase, el arranque
  continúa, pero la autenticación responde 503: nunca se simula un inicio de sesión.
- En `production` se rechazan orígenes CORS comodín y se exige configuración de autenticación.
- `SecretStr` evita que los secretos aparezcan en `repr`, logs o respuestas de error.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal"


class Settings(BaseSettings):
    """Parámetros de ejecución. Ver `apps/api/.env.example` para la lista completa y su descripción."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0a1"
    log_level: str = "INFO"

    # Base de datos. La conexión de la aplicación debe poder cambiar al rol `database_app_role`,
    # que no tiene BYPASSRLS, para que las políticas de RLS se apliquen en cada petición.
    database_url: str = DEFAULT_DATABASE_URL
    database_app_role: str = "portal_app"

    # Supabase Auth. Se usa `supabase_jwt_secret` (HS256) o `supabase_jwks_url` (RS256/ES256).
    supabase_url: str | None = None
    supabase_jwt_secret: SecretStr | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    jwt_leeway_seconds: int = Field(default=30, ge=0, le=120)

    # Web y CORS. Solo orígenes explícitos; nunca "*".
    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )

    # Documentación OpenAPI (Swagger). Sin valor explícito: activa fuera de producción y desactivada en
    # producción. En producción solo se activa si DOCS_ENABLED=true lo pide de forma explícita.
    docs_enabled: bool | None = None

    # Límites de negocio.
    max_comment_length: int = Field(default=2000, ge=1, le=10000)
    default_page_size: int = Field(default=50, ge=1, le=100)

    @field_validator("cors_allowed_origins")
    @classmethod
    def _no_wildcard_origins(cls, value: list[str]) -> list[str]:
        if any(origin.strip() == "*" for origin in value):
            raise ValueError("CORS_ALLOWED_ORIGINS no puede contener '*'; indique orígenes explícitos.")
        return [origin.strip().rstrip("/") for origin in value if origin.strip()]

    @model_validator(mode="after")
    def _production_requires_real_auth(self) -> Settings:
        if self.app_env == "production":
            if not (self.supabase_url and (self.supabase_jwt_secret or self.supabase_jwks_url)):
                raise ValueError(
                    "En producción se requiere SUPABASE_URL y SUPABASE_JWT_SECRET o SUPABASE_JWKS_URL."
                )
        if self.docs_enabled is None:
            # Valor por defecto: documentación fuera de producción; en producción, desactivada.
            object.__setattr__(self, "docs_enabled", self.app_env != "production")
        return self

    @property
    def supabase_issuer(self) -> str | None:
        """Emisor esperado de los tokens de Supabase Auth (`<SUPABASE_URL>/auth/v1`)."""
        if not self.supabase_url:
            return None
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url and (self.supabase_jwt_secret or self.supabase_jwks_url))


@lru_cache
def get_settings() -> Settings:
    """Configuración en caché para el proceso. Los tests crean instancias propias."""
    return Settings()
