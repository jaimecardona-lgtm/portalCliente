"""Fábrica de la aplicación FastAPI.

Uso local (ver `apps/api/README.md`):

    uvicorn app.main:create_app --factory --reload --port 8000

La fábrica no abre conexiones al crear la aplicación: el motor se conecta en la primera petición.
Los tests pueden inyectar su propio verificador de tokens y su propio motor.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine

from app.api.documents import router as documents_router
from app.api.logix import router as logix_router
from app.api.staff import router as staff_router
from app.api.v1 import router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.request_context import RequestIdMiddleware
from app.core.security import TokenVerifier, build_token_verifier
from app.db.session import create_db_engine, make_session_factory
from app.services.storage import ObjectStorage, build_storage
from app.web.spa import is_spa_build, register_spa


def create_app(
    settings: Settings | None = None,
    *,
    token_verifier: TokenVerifier | None = None,
    database_engine: Engine | None = None,
    object_storage: ObjectStorage | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    owns_engine = database_engine is None
    engine = database_engine or create_db_engine(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        if owns_engine:
            engine.dispose()

    docs_on = settings.docs_enabled
    app = FastAPI(
        title="Portal de Clientes Logixtic — API",
        version=settings.app_version,
        docs_url="/docs" if docs_on else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_on else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    # Sin configuración de Storage no hay adaptador: las rutas de documentos
    # responden 503. Nunca se usan datos simulados.
    app.state.storage = object_storage if object_storage is not None else build_storage(settings)
    app.state.token_verifier = (
        token_verifier if token_verifier is not None else build_token_verifier(settings)
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=False,
        # Métodos y cabeceras de las rutas efectivas (ver app/api). Sin comodines.
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Tenant-Id",
            "X-File-Name",
            "X-Request-ID",
        ],
    )
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    app.include_router(router)
    app.include_router(documents_router)
    app.include_router(staff_router)
    app.include_router(logix_router, prefix="/api/v1")

    # El frontend se registra al final: las rutas de API y /health tienen prioridad sobre el fallback SPA.
    if settings.web_dist_dir:
        dist = Path(settings.web_dist_dir)
        if is_spa_build(dist):
            register_spa(app, dist)
    return app
