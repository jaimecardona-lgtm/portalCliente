"""Dependencias de FastAPI: token, sesión de base de datos y contexto de la petición.

Orden de resolución en una ruta protegida:

1. `get_bearer_token`: exige cabecera `Authorization: Bearer <token>`.
2. `get_claims`: verifica firma, emisor, audiencia y caducidad. Sin configuración de Supabase, 503.
3. `get_db`: abre una sesión y fija `SET LOCAL ROLE portal_app` + identidad (ver `app.db.session`).
4. `get_context`: lee las membresías bajo RLS y elige la empresa (`X-Tenant-Id` o la única membresía).

El cliente nunca aporta tenant ni rol: solo puede elegir entre membresías existentes.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AccessDenied, AppError, AuthenticationRequired, AuthNotConfigured
from app.core.security import TokenClaims
from app.db.session import activate_request_security
from app.services.access import RequestContext, resolve_context
from app.services.staff import StaffContext, resolve_staff

TENANT_HEADER = "X-Tenant-Id"


def get_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization:
        raise AuthenticationRequired()
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationRequired()
    return token


def get_claims(request: Request, token: Annotated[str, Depends(get_bearer_token)]) -> TokenClaims:
    verifier = request.app.state.token_verifier
    if verifier is None:
        raise AuthNotConfigured()
    claims: TokenClaims = verifier.verify(token)
    return claims


def get_db(
    request: Request,
    claims: Annotated[TokenClaims, Depends(get_claims)],
) -> Iterator[Session]:
    settings: Settings = request.app.state.settings
    session: Session = request.app.state.session_factory()
    try:
        activate_request_security(session, app_role=settings.database_app_role, user_id=claims.subject)
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def get_context(
    session: Annotated[Session, Depends(get_db)],
    claims: Annotated[TokenClaims, Depends(get_claims)],
    x_tenant_id: Annotated[str | None, Header(alias=TENANT_HEADER)] = None,
) -> RequestContext:
    requested: UUID | None = None
    if x_tenant_id is not None:
        try:
            requested = UUID(x_tenant_id.strip())
        except ValueError as exc:
            raise AppError(
                "La cabecera X-Tenant-Id no es un identificador válido.",
                code="invalid_tenant_header",
                status_code=400,
            ) from exc
    return resolve_context(session, claims, requested)


def get_staff(
    session: Annotated[Session, Depends(get_db)],
    claims: Annotated[TokenClaims, Depends(get_claims)],
) -> StaffContext:
    """Personal interno activo. Un token válido sin registro activo en platform_staff se rechaza."""
    ctx = resolve_staff(session, claims.subject)
    if ctx is None:
        raise AccessDenied("Su usuario no tiene un rol interno autorizado.", code="no_staff_role")
    return ctx
