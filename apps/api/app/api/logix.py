"""Endpoint de Logix para el Portal Cliente (una sola ruta, autenticada).

Contrato: POST /api/v1/logix/chat  {message, lang?}  -> {answer, answer_kind, tenant, sources}
- Valida el JWT y resuelve la identidad: personal interno (rol activo) o cliente final (membresía).
- El tenant de trabajo viene de X-Tenant-Id y se valida en el servidor (RLS y alcance).
  Nunca se confía en el cliente.
- Preguntas privadas: solo consultas deterministas al tenant autorizado.
  Preguntas generales: OpenRouter, si está habilitado y autorizado. Ver app/services/logix.py.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_claims, get_db
from app.api.v1 import AUTH_RESPONSES
from app.core.errors import AccessDenied, AppError
from app.core.security import TokenClaims
from app.repositories import portal as portal_repo
from app.services import logix as logix_svc
from app.services import staff as staff_svc
from app.services.access import resolve_context
from app.services.logix_turn import answer_turn
from app.services.staff import resolve_staff

router = APIRouter(tags=["logix"])
LOGIX_RESPONSES: dict[int | str, dict[str, Any]] = {
    **AUTH_RESPONSES,
    403: {"description": "Empresa no autorizada para esta cuenta."},
    429: {"description": "Límite de consultas de Logix alcanzado."},
}
_LIMITER = logix_svc.RateLimiter()
_NO_CONTEXT_CODES = frozenset({"no_tenant_membership", "tenant_selection_required"})


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=800)


def _tenant_header(value: str | None) -> UUID | None:
    if value is None or not value.strip():
        return None
    try:
        return UUID(value.strip())
    except ValueError as exc:
        raise AppError(
            "La cabecera X-Tenant-Id no es válida.", code="invalid_tenant_header", status_code=400
        ) from exc


@router.post("/logix/chat", responses=LOGIX_RESPONSES)
def chat(
    body: ChatIn,
    request: Request,
    session: Annotated[Session, Depends(get_db)],
    claims: Annotated[TokenClaims, Depends(get_claims)],
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-Id")] = None,
) -> dict[str, Any]:
    settings = request.app.state.settings
    if not _LIMITER.allow(claims.subject, settings.logix_max_requests_per_user_per_hour):
        raise AppError(
            "Ha alcanzado el límite de consultas de Logix. Inténtelo más tarde.",
            code="rate_limited",
            status_code=429,
        )
    question = body.message.strip()
    requested = _tenant_header(x_tenant_id)

    tenant_id: UUID | None = None
    tenant_name: str | None = None
    staff_ctx = resolve_staff(session, claims.subject)
    if staff_ctx is not None:
        # Personal interno: la empresa debe ser visible y coincidir con el contexto reautenticado.
        if requested is not None:
            visible = staff_svc.tenant_visible(
                session, requested, allow_qa=bool(settings.qa_synthetic_enabled)
            )
            active = staff_svc.previous_context_tenant(session)
            if not visible or active != requested:
                raise AccessDenied(
                    "Seleccione y confirme esta empresa antes de consultar Logix.",
                    code="tenant_context_mismatch",
                )
            staff_svc.fix_selected_tenant(session, requested)
            tenant_id = requested
            tenant = portal_repo.get_tenant(session, requested)
            tenant_name = tenant.legal_name if tenant else None
    else:
        try:
            ctx = resolve_context(session, claims, requested)
            tenant_id = ctx.tenant_id
            tenant_name = ctx.tenant_legal_name
        except AccessDenied as exc:
            if exc.code not in _NO_CONTEXT_CODES:
                raise

    answer, wrote = answer_turn(
        session,
        question=question,
        settings=settings,
        user_id=claims.subject,
        tenant_id=tenant_id,
        staff_ctx=staff_ctx,
    )
    if wrote:
        session.commit()
    return _payload(answer, tenant_name)


def _payload(answer: logix_svc.LogixAnswer, tenant_name: str | None) -> dict[str, Any]:
    return {
        "answer": answer.text,
        "answer_kind": answer.kind,
        "tenant": tenant_name,
        "sources": list(answer.sources),
        "tools": list(answer.tools),
        "follow_ups": list(answer.follow_ups),
        "limitations": list(answer.limitations),
    }
