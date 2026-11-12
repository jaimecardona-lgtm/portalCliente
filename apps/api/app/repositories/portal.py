"""Consultas del portal. Todas reciben `tenant_id` y lo filtran explícitamente.

Responsabilidad: leer y escribir filas. No decide permisos ni reglas de negocio (eso está en `app.services`).

Defensa en profundidad: el filtro por `tenant_id` va en la consulta y, además, PostgreSQL aplica RLS
con el rol `portal_app`. Si una de las dos capas fallara, la otra sigue aislando a la empresa.

Visibilidad: por defecto solo se devuelven filas `visibility = 'client'`. Los comentarios y eventos
internos solo salen con `include_internal=True`, que la API v1 nunca usa.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EventComment, OperationEvent, OperationRef, Profile, Tenant, TenantMembership

# --- Usuario, membresías y empresa -----------------------------------------------------------------


def list_active_memberships(session: Session, user_id: UUID) -> list[TenantMembership]:
    stmt = (
        select(TenantMembership)
        .where(TenantMembership.user_id == user_id, TenantMembership.active.is_(True))
        .order_by(TenantMembership.created_at, TenantMembership.id)
    )
    return list(session.scalars(stmt))


def get_profile(session: Session, user_id: UUID) -> Profile | None:
    return session.get(Profile, user_id)


def get_tenant(session: Session, tenant_id: UUID) -> Tenant | None:
    return session.get(Tenant, tenant_id)


# --- Operaciones (referencias sincronizadas desde Logixtic) ----------------------------------------


def list_operations(session: Session, tenant_id: UUID, *, limit: int, offset: int) -> list[OperationRef]:
    stmt = (
        select(OperationRef)
        .where(OperationRef.tenant_id == tenant_id)
        .order_by(OperationRef.do_number, OperationRef.id)
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(stmt))


def get_operation(session: Session, tenant_id: UUID, operation_id: UUID) -> OperationRef | None:
    stmt = select(OperationRef).where(OperationRef.tenant_id == tenant_id, OperationRef.id == operation_id)
    return session.scalars(stmt).one_or_none()


def list_events(
    session: Session, tenant_id: UUID, operation_id: UUID, *, include_internal: bool = False
) -> list[OperationEvent]:
    stmt = select(OperationEvent).where(
        OperationEvent.tenant_id == tenant_id, OperationEvent.operation_id == operation_id
    )
    if not include_internal:
        stmt = stmt.where(OperationEvent.visibility == "client")
    stmt = stmt.order_by(OperationEvent.occurred_at, OperationEvent.id)
    return list(session.scalars(stmt))


def get_event(
    session: Session,
    tenant_id: UUID,
    operation_id: UUID,
    event_id: UUID,
    *,
    include_internal: bool = False,
) -> OperationEvent | None:
    stmt = select(OperationEvent).where(
        OperationEvent.tenant_id == tenant_id,
        OperationEvent.operation_id == operation_id,
        OperationEvent.id == event_id,
    )
    if not include_internal:
        stmt = stmt.where(OperationEvent.visibility == "client")
    return session.scalars(stmt).one_or_none()


# --- Comentarios ----------------------------------------------------------------------------------


def list_comments(
    session: Session, tenant_id: UUID, event_id: UUID, *, include_internal: bool = False
) -> list[EventComment]:
    stmt = select(EventComment).where(EventComment.tenant_id == tenant_id, EventComment.event_id == event_id)
    if not include_internal:
        stmt = stmt.where(EventComment.visibility == "client")
    stmt = stmt.order_by(EventComment.created_at, EventComment.id)
    return list(session.scalars(stmt))


def get_comment(
    session: Session,
    tenant_id: UUID,
    event_id: UUID,
    comment_id: UUID,
    *,
    include_internal: bool = False,
) -> EventComment | None:
    stmt = select(EventComment).where(
        EventComment.tenant_id == tenant_id,
        EventComment.event_id == event_id,
        EventComment.id == comment_id,
    )
    if not include_internal:
        stmt = stmt.where(EventComment.visibility == "client")
    return session.scalars(stmt).one_or_none()
