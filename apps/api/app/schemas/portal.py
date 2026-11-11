"""Contratos JSON de la API v1.

Entradas: `extra="forbid"`. Un campo desconocido (por ejemplo `tenant_id` o `author_id`) responde 422.
Salidas: solo los campos que el portal muestra. Nunca se exponen rutas de almacenamiento, identificadores
externos de Logixtic ni `author_id`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# Debe coincidir con el CHECK de `event_comments.body` en la migración 0001.
COMMENT_BODY_MAX = 2000


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str


class TenantOut(_Out):
    id: UUID
    slug: str
    legal_name: str


class MembershipOut(BaseModel):
    tenant_id: UUID
    role: str


class MeOut(BaseModel):
    user_id: UUID
    full_name: str
    tenant: TenantOut
    role: str
    can_comment: bool
    memberships: list[MembershipOut]


class OperationOut(_Out):
    id: UUID
    do_number: str
    reference: str | None
    last_known_status: str | None
    last_synced_at: datetime | None


class EventOut(_Out):
    id: UUID
    event_type: str
    occurred_at: datetime
    title: str
    description: str | None
    author_name: str | None
    from_status: str | None
    to_status: str | None


class CommentOut(_Out):
    id: UUID
    event_id: UUID
    parent_comment_id: UUID | None
    author_name: str
    author_side: Literal["client", "operator"]
    body: str
    created_at: datetime


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=COMMENT_BODY_MAX)]
    parent_comment_id: UUID | None = None


class Page(BaseModel):
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class ErrorBody(BaseModel):
    """Cuerpo de error. Nunca incluye valores enviados por el cliente ni detalles internos."""

    code: str
    message: str
    request_id: str
    fields: list[dict[str, str]] | None = None


class ErrorEnvelope(BaseModel):
    """Formato único de error de la API (ver app/core/errors.py)."""

    error: ErrorBody
