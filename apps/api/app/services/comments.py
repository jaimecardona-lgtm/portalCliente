"""Reglas de comentarios sobre eventos de una operación.

Reglas del dominio (ver `CLAUDE.md`):

1. Un comentario cuelga de un evento (`event_id`). Las respuestas usan `parent_comment_id`, que debe
   pertenecer al mismo evento y a la misma empresa; si no, se responde 404.
2. Un comentario nunca cambia el estado de la operación. Esta función no escribe en `operation_refs`.
3. El autor se fija en el servidor: `author_id` es la persona autenticada, `author_side = client` y
   `author_name` se copia de su perfil. El cliente no puede elegir nada de eso.
4. Solo `client_admin` y `client_member` pueden comentar. `client_viewer` solo lee.
5. Los eventos y comentarios internos no son visibles: responden 404 como si no existieran.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.errors import AccessDenied, NotFound
from app.db.models import EventComment
from app.repositories import portal
from app.services.access import RequestContext


def list_visible_comments(
    session: Session, ctx: RequestContext, operation_id: UUID, event_id: UUID
) -> list[EventComment]:
    _require_visible_event(session, ctx, operation_id, event_id)
    return portal.list_comments(session, ctx.tenant_id, event_id)


def create_comment(
    session: Session,
    ctx: RequestContext,
    operation_id: UUID,
    event_id: UUID,
    *,
    body: str,
    parent_comment_id: UUID | None,
) -> EventComment:
    if not ctx.can_comment:
        raise AccessDenied(
            "Su rol permite consultar la información, pero no comentar.", code="role_cannot_comment"
        )
    _require_visible_event(session, ctx, operation_id, event_id)

    if parent_comment_id is not None:
        parent = portal.get_comment(session, ctx.tenant_id, event_id, parent_comment_id)
        if parent is None:
            raise NotFound("El comentario al que responde no existe.", code="parent_comment_not_found")

    comment = EventComment(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        operation_id=operation_id,
        event_id=event_id,
        parent_comment_id=parent_comment_id,
        author_id=ctx.user_id,
        author_name=ctx.full_name,
        author_side="client",
        body=body,
        visibility="client",
    )
    session.add(comment)
    session.flush()
    session.refresh(comment)
    return comment


def _require_visible_event(session: Session, ctx: RequestContext, operation_id: UUID, event_id: UUID) -> None:
    if portal.get_event(session, ctx.tenant_id, operation_id, event_id) is None:
        raise NotFound("El evento no existe.", code="event_not_found")
