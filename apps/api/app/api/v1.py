"""Rutas de la API v1. Todas (salvo /health) exigen sesión y empresa resuelta en el servidor.

Respuestas de lista: `limit` (1–100, por defecto `default_page_size`) y `offset`.
Las consultas de datos se delegan a `app.repositories.portal` y las reglas de escritura a `app.services`.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_context, get_db
from app.core.config import Settings
from app.core.errors import NotFound
from app.repositories import portal
from app.schemas.portal import (
    CommentCreate,
    CommentOut,
    ErrorEnvelope,
    EventOut,
    HealthOut,
    MembershipOut,
    MeOut,
    OperationOut,
    TenantOut,
)
from app.services import comments as comment_service
from app.services.access import RequestContext

router = APIRouter()
api = APIRouter(prefix="/api/v1")

ContextDep = Annotated[RequestContext, Depends(get_context)]
DbDep = Annotated[Session, Depends(get_db)]


def _limit(request: Request, limit: Annotated[int | None, Query(ge=1, le=100)] = None) -> int:
    if limit is not None:
        return limit
    settings: Settings = request.app.state.settings
    return settings.default_page_size


LimitDep = Annotated[int, Depends(_limit)]
OffsetDep = Annotated[int, Query(ge=0, le=100_000)]

# Respuestas de error documentadas en OpenAPI. Todas usan el sobre ErrorEnvelope.
_ERR = {"model": ErrorEnvelope}
AUTH_RESPONSES: dict[int | str, dict] = {
    400: {**_ERR, "description": "Cabecera o parámetro no válido, o falta elegir empresa."},
    401: {**_ERR, "description": "Falta el token, no es válido o ha caducado."},
    403: {**_ERR, "description": "Sin membresía, empresa o perfil inactivo, o rol sin permiso."},
    422: {**_ERR, "description": "Datos de entrada no válidos (solo ubicación y tipo del error)."},
    503: {**_ERR, "description": "Autenticación no configurada en este entorno."},
}


def _responses(*extra: int) -> dict[int | str, dict]:
    """Respuestas de autenticación más las de negocio indicadas (404 por recurso no visible)."""
    out = dict(AUTH_RESPONSES)
    for status in extra:
        out[status] = {**_ERR, "description": NOT_FOUND_TEXT[status]}
    return out


NOT_FOUND_TEXT = {
    404: "El recurso no existe o pertenece a otra empresa (ambos casos responden igual).",
}


@router.get("/health", response_model=HealthOut, tags=["sistema"])
def health(request: Request) -> HealthOut:
    settings: Settings = request.app.state.settings
    return HealthOut(status="ok", version=settings.app_version)


@api.get("/me", response_model=MeOut, tags=["sesión"], responses=_responses())
def me(ctx: ContextDep) -> MeOut:
    return MeOut(
        user_id=ctx.user_id,
        full_name=ctx.full_name,
        tenant=TenantOut(id=ctx.tenant_id, slug=ctx.tenant_slug, legal_name=ctx.tenant_legal_name),
        role=ctx.role,
        can_comment=ctx.can_comment,
        memberships=[MembershipOut(tenant_id=m.tenant_id, role=m.role) for m in ctx.memberships],
    )


@api.get("/tenants/current", response_model=TenantOut, tags=["empresa"], responses=_responses())
def current_tenant(ctx: ContextDep) -> TenantOut:
    return TenantOut(id=ctx.tenant_id, slug=ctx.tenant_slug, legal_name=ctx.tenant_legal_name)


@api.get("/operations", response_model=list[OperationOut], tags=["operaciones"], responses=_responses())
def list_operations(
    ctx: ContextDep,
    session: DbDep,
    limit: LimitDep,
    offset: OffsetDep = 0,
) -> list[OperationOut]:
    rows = portal.list_operations(session, ctx.tenant_id, limit=limit, offset=offset)
    return [OperationOut.model_validate(row) for row in rows]


@api.get(
    "/operations/{operation_id}",
    response_model=OperationOut,
    tags=["operaciones"],
    responses=_responses(404),
)
def get_operation(operation_id: UUID, ctx: ContextDep, session: DbDep) -> OperationOut:
    row = portal.get_operation(session, ctx.tenant_id, operation_id)
    if row is None:
        raise NotFound("La operación no existe.", code="operation_not_found")
    return OperationOut.model_validate(row)


@api.get(
    "/operations/{operation_id}/events",
    response_model=list[EventOut],
    tags=["operaciones"],
    responses=_responses(404),
)
def list_events(operation_id: UUID, ctx: ContextDep, session: DbDep) -> list[EventOut]:
    if portal.get_operation(session, ctx.tenant_id, operation_id) is None:
        raise NotFound("La operación no existe.", code="operation_not_found")
    rows = portal.list_events(session, ctx.tenant_id, operation_id)
    return [EventOut.model_validate(row) for row in rows]


@api.get(
    "/operations/{operation_id}/events/{event_id}/comments",
    response_model=list[CommentOut],
    tags=["comentarios"],
    responses=_responses(404),
)
def list_comments(operation_id: UUID, event_id: UUID, ctx: ContextDep, session: DbDep) -> list[CommentOut]:
    rows = comment_service.list_visible_comments(session, ctx, operation_id, event_id)
    return [CommentOut.model_validate(row) for row in rows]


@api.post(
    "/operations/{operation_id}/events/{event_id}/comments",
    response_model=CommentOut,
    status_code=201,
    tags=["comentarios"],
    responses=_responses(404),
)
def create_comment(
    operation_id: UUID,
    event_id: UUID,
    payload: CommentCreate,
    ctx: ContextDep,
    session: DbDep,
) -> CommentOut:
    row = comment_service.create_comment(
        session,
        ctx,
        operation_id,
        event_id,
        body=payload.body,
        parent_comment_id=payload.parent_comment_id,
    )
    return CommentOut.model_validate(row)


router.include_router(api)
