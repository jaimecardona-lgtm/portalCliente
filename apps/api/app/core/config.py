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

    # Frontend compilado servido por FastAPI en el mismo origen (Docker: /app/web/dist).
    # Sin valor, la API no sirve React (desarrollo: Vite sirve la interfaz).
    web_dist_dir: str | None = None

    # Pool de conexiones para una instancia pequeña (Render Free, 512 MB). Ver docs/deployment-render.md.
    database_pool_size: int = Field(default=2, ge=1, le=20)
    database_max_overflow: int = Field(default=0, ge=0, le=20)

    # Límites de negocio.
    max_comment_length: int = Field(default=2000, ge=1, le=10000)
    default_page_size: int = Field(default=50, ge=1, le=100)

    # Agente Logix (OpenRouter). Todo desactivado por defecto. Las credenciales solo las usa FastAPI:
    # nunca se envían al frontend, no son build args de Docker y no se registran en logs.
    # Los modelos no tienen valor por defecto: se fijan tras verificar disponibilidad, precio, herramientas,
    # privacidad y dimensiones de embeddings (ver docs/logix-arquitectura.md).
    logix_ai_enabled: bool = False
    logix_rag_enabled: bool = False
    # Interruptor de negocio: sin esta autorización explícita, Logix no puede enviar datos a OpenRouter.
    logix_external_processing_authorized: bool = False
    openrouter_api_key: SecretStr | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str | None = None
    openrouter_embedding_model: str | None = None
    # Límites de contexto, tokens, tiempo y consumo. Se aplican en el cliente y en el orquestador.
    logix_max_input_tokens: int = Field(default=4000, ge=256, le=32000)
    logix_max_output_tokens: int = Field(default=800, ge=64, le=4000)
    logix_timeout_seconds: float = Field(default=20.0, gt=0, le=60)
    logix_max_requests_per_user_per_hour: int = Field(default=30, ge=1, le=1000)
    logix_daily_budget_usd: float = Field(default=5.0, ge=0, le=10000)
    logix_max_retrieved_chunks: int = Field(default=6, ge=0, le=20)

    @field_validator("openrouter_base_url")
    @classmethod
    def _openrouter_requires_https(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("OPENROUTER_BASE_URL debe usar https.")
        return value.rstrip("/")

    @model_validator(mode="after")
    def _logix_requires_explicit_authorization(self) -> Settings:
        if self.logix_rag_enabled and not self.logix_ai_enabled:
            raise ValueError("LOGIX_RAG_ENABLED requiere LOGIX_AI_ENABLED.")
        if self.logix_ai_enabled:
            if not self.logix_external_processing_authorized:
                raise ValueError(
                    "LOGIX_AI_ENABLED requiere LOGIX_EXTERNAL_PROCESSING_AUTHORIZED=true (autorización)."
                )
            if self.openrouter_api_key is None or not self.openrouter_api_key.get_secret_value().strip():
                raise ValueError("LOGIX_AI_ENABLED requiere OPENROUTER_API_KEY.")
            if not (self.openrouter_model or "").strip():
                raise ValueError("LOGIX_AI_ENABLED requiere OPENROUTER_MODEL (modelo verificado).")
        if self.logix_rag_enabled and not (self.openrouter_embedding_model or "").strip():
            raise ValueError("LOGIX_RAG_ENABLED requiere OPENROUTER_EMBEDDING_MODEL (modelo verificado).")
        return self

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
