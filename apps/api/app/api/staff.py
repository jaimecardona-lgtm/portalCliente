"""Rutas del personal interno (/api/v1/staff). Solo para personal con rol activo y tenants asignados.

Ninguna ruta devuelve datos de todos los tenants sin contexto. El tenant de trabajo siempre viene de la ruta
o del cuerpo, se valida contra la asignación en la base de datos y se fija en la transacción antes de
consultar datos. Un cliente externo recibe 403 `no_staff_role` aunque tenga membresías de cliente."""

from __future__ import annotations

import hashlib
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_staff
from app.api.v1 import AUTH_RESPONSES
from app.core.errors import AccessDenied
from app.services import staff as svc
from app.services.staff import StaffContext

router = APIRouter(prefix="/api/v1/staff")

StaffDep = Annotated[StaffContext, Depends(get_staff)]
DbDep = Annotated[Session, Depends(get_db)]
_STAFF_RESPONSES: dict[int | str, dict[str, Any]] = {
    **AUTH_RESPONSES,
    403: {"description": "Sin rol interno activo, o sin permiso, o tenant no asignado y verificado."},
}


def _require(ctx: StaffContext, permission: str) -> None:
    if not ctx.can(permission):
        raise AccessDenied("Su rol no tiene este permiso.", code="permission_denied")


@router.get("/me", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_me(ctx: StaffDep) -> dict[str, Any]:
    return {
        "user_id": str(ctx.user_id),
        "full_name": ctx.full_name,
        "staff_role": ctx.staff_role,
        "permissions": sorted(ctx.permissions),
    }


@router.get("/tenants", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_tenants(ctx: StaffDep, session: DbDep, request: Request) -> dict[str, Any]:
    _require(ctx, "tenants.read")
    items = svc.assigned_tenants(session)
    if not request.app.state.settings.qa_synthetic_enabled:
        # Segunda barrera (la primera es la bandera de base de datos y RLS): sin configuración QA no se listan.
        items = [i for i in items if not i["qa_synthetic"]]
    svc.audit(session, ctx, "tenants_list", tenant_id=None, result="allowed")
    session.commit()
    return {"items": items}


@router.get("/observed-tenants", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_observed_tenants(ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    """Catálogo de empresas observadas en Logixtic (solo lectura, sin operaciones)."""
    _require(ctx, "tenants.read")
    return {"items": svc.observed_tenants(session)}


class ChallengeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: UUID


class ContextIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: UUID
    challenge_id: UUID


@router.post("/context/challenge", tags=["personal interno"], responses=_STAFF_RESPONSES)
def create_context_challenge(
    body: ChallengeIn, ctx: StaffDep, session: DbDep, request: Request
) -> dict[str, Any]:
    """Desafío de cambio de empresa: solo para empresas autorizadas, con caducidad y un solo uso."""
    _require(ctx, "tenants.read")
    if not svc.tenant_visible(session, body.tenant_id, allow_qa=_qa_enabled(request)):
        svc.audit(
            session, ctx, "context_denied", tenant_id=None, result="denied", reason="tenant_not_assigned"
        )
        session.commit()
        raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")
    result = svc.request_context_challenge(session, body.tenant_id)
    session.commit()
    return result


@router.post("/context", tags=["personal interno"], responses=_STAFF_RESPONSES)
def select_context(
    body: ContextIn,
    request: Request,
    ctx: StaffDep,
    session: DbDep,
    x_reauth_token: Annotated[str | None, Header(alias="X-Reauth-Token")] = None,
) -> dict[str, Any]:
    """Cambio de empresa con reautenticación por contraseña reciente, vinculada al desafío."""
    _require(ctx, "tenants.read")
    if not x_reauth_token:
        raise AccessDenied("Se requiere confirmar su contraseña.", code="reauth_required")
    try:
        claims = request.app.state.token_verifier.verify(x_reauth_token)
    except Exception as exc:  # token inválido o caducado: no se revela el motivo
        raise AccessDenied("La verificación de contraseña no es válida.", code="reauth_required") from exc
    if claims.subject != ctx.user_id or claims.password_authenticated_at is None:
        raise AccessDenied("La verificación de contraseña no es válida.", code="reauth_required")
    fingerprint = hashlib.sha256(x_reauth_token.encode("utf-8")).hexdigest()
    previous = svc.previous_context_tenant(session)
    confirmed = svc.confirm_context_change(
        session, body.challenge_id, claims.password_authenticated_at, fingerprint, previous
    )
    if confirmed != body.tenant_id:
        raise AccessDenied("Este cambio ya no es válido. Vuelva a intentarlo.", code="challenge_invalid")
    svc.fix_selected_tenant(session, confirmed)
    svc.audit(
        session,
        ctx,
        "context_select",
        tenant_id=confirmed,
        result="allowed",
        previous_tenant_id=previous,
        reauthenticated_at=claims.password_authenticated_at,
    )
    tenant = next(t for t in svc.assigned_tenants(session) if t["id"] == str(confirmed))
    session.commit()
    return {"tenant": tenant}


@router.post("/context/exit", tags=["personal interno"], responses=_STAFF_RESPONSES)
def exit_context(ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    previous = svc.previous_context_tenant(session)
    svc.audit(session, ctx, "context_exit", tenant_id=None, result="allowed", previous_tenant_id=previous)
    session.commit()
    return {"ok": True}


@router.get("/tenants/{tenant_id}/operations", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_tenant_operations(
    tenant_id: UUID, ctx: StaffDep, session: DbDep, request: Request
) -> dict[str, Any]:
    _require(ctx, "operations.read")
    if not svc.tenant_visible(session, tenant_id, allow_qa=_qa_enabled(request)):
        svc.audit(
            session, ctx, "context_denied", tenant_id=None, result="denied", reason="tenant_not_assigned"
        )
        session.commit()
        raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")
    svc.fix_selected_tenant(session, tenant_id)
    items = svc.operations_of_selected_tenant(session, tenant_id)
    svc.audit(session, ctx, "operations_list", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"items": items}


@router.get(
    "/tenants/{tenant_id}/operations/{operation_id}/events",
    tags=["personal interno"],
    responses=_STAFF_RESPONSES,
)
def staff_operation_events(
    tenant_id: UUID, operation_id: UUID, ctx: StaffDep, session: DbDep, request: Request
) -> dict[str, Any]:
    _require(ctx, "operations.read")
    if not svc.tenant_visible(session, tenant_id, allow_qa=_qa_enabled(request)):
        svc.audit(
            session, ctx, "context_denied", tenant_id=None, result="denied", reason="tenant_not_assigned"
        )
        session.commit()
        raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")
    svc.fix_selected_tenant(session, tenant_id)
    items = svc.events_of_selected_operation(session, tenant_id, operation_id)
    svc.audit(session, ctx, "operations_list", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"items": items}


def _qa_enabled(request: Request) -> bool:
    return bool(request.app.state.settings.qa_synthetic_enabled)


def _selected_tenant(
    session: Session, ctx: StaffContext, tenant_id: UUID, permission: str, request: Request
) -> None:
    """Permiso + empresa asignada (o pendiente con permiso propio) + fijar el tenant de la transacción."""
    _require(ctx, permission)
    if not svc.tenant_visible(session, tenant_id, allow_qa=_qa_enabled(request)):
        svc.audit(
            session, ctx, "context_denied", tenant_id=None, result="denied", reason="tenant_not_assigned"
        )
        session.commit()
        raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")
    svc.fix_selected_tenant(session, tenant_id)


class ClientAccountIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    legal_name: str = Field(min_length=2, max_length=200)
    tax_id: str | None = Field(default=None, min_length=3, max_length=40)


class RequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_type: Literal["consulta", "modificacion_datos", "documentacion", "cotizacion", "otro"]
    subject: str = Field(min_length=5, max_length=120)
    description: str = Field(min_length=20, max_length=2000)


@router.get("/tenants/{tenant_id}/client-accounts", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_list_client_accounts(tenant_id: UUID, ctx: StaffDep, session: DbDep, request: Request) -> dict[str, Any]:
    _selected_tenant(session, ctx, tenant_id, "operations.read", request)
    items = svc.list_client_accounts(session, tenant_id)
    svc.audit(session, ctx, "operations_list", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"items": items}


@router.post(
    "/tenants/{tenant_id}/client-accounts",
    status_code=201,
    tags=["personal interno"],
    responses=_STAFF_RESPONSES,
)
def staff_create_client_account(
    tenant_id: UUID, body: ClientAccountIn, ctx: StaffDep, session: DbDep, request: Request
) -> dict[str, Any]:
    _selected_tenant(session, ctx, tenant_id, "records.write", request)
    item = svc.create_client_account(session, ctx, tenant_id, body.legal_name, body.tax_id)
    svc.audit(session, ctx, "record_create", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"item": item}


@router.get("/tenants/{tenant_id}/requests", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_list_requests(tenant_id: UUID, ctx: StaffDep, session: DbDep, request: Request) -> dict[str, Any]:
    _selected_tenant(session, ctx, tenant_id, "operations.read", request)
    items = svc.list_requests(session, tenant_id)
    svc.audit(session, ctx, "operations_list", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"items": items}


@router.post(
    "/tenants/{tenant_id}/requests",
    status_code=201,
    tags=["personal interno"],
    responses=_STAFF_RESPONSES,
)
def staff_create_request(
    tenant_id: UUID, body: RequestIn, ctx: StaffDep, session: DbDep, request: Request
) -> dict[str, Any]:
    _selected_tenant(session, ctx, tenant_id, "records.write", request)
    item = svc.create_request(
        session, ctx, tenant_id, body.request_type, body.subject, body.description
    )
    svc.audit(session, ctx, "record_create", tenant_id=tenant_id, result="allowed")
    session.commit()
    return {"item": item}
