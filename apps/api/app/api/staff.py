"""Rutas del personal interno (/api/v1/staff). Solo para personal con rol activo y tenants asignados.

Ninguna ruta devuelve datos de todos los tenants sin contexto. El tenant de trabajo siempre viene de la ruta
o del cuerpo, se valida contra la asignación en la base de datos y se fija en la transacción antes de
consultar datos. Un cliente externo recibe 403 `no_staff_role` aunque tenga membresías de cliente."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends
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


class ContextIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: UUID
    # Motivo de soporte: obligatorio y auditado con el cambio de empresa.
    reason: str = Field(min_length=3, max_length=300)


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
def staff_tenants(ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    _require(ctx, "tenants.read")
    items = svc.assigned_tenants(session)
    svc.audit(session, ctx, "tenants_list", tenant_id=None, result="allowed")
    session.commit()
    return {"items": items}


@router.get("/observed-tenants", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_observed_tenants(ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    """Catálogo de empresas observadas en Logixtic (solo lectura, sin operaciones)."""
    _require(ctx, "tenants.read")
    return {"items": svc.observed_tenants(session)}


@router.post("/context", tags=["personal interno"], responses=_STAFF_RESPONSES)
def select_context(body: ContextIn, ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    _require(ctx, "tenants.read")
    if not svc.tenant_visible(session, body.tenant_id):
        svc.audit(
            session, ctx, "context_denied", tenant_id=None, result="denied", reason="tenant_not_assigned"
        )
        session.commit()
        raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")
    previous = svc.previous_context_tenant(session)
    svc.fix_selected_tenant(session, body.tenant_id)
    svc.audit(
        session,
        ctx,
        "context_select",
        tenant_id=body.tenant_id,
        result="allowed",
        reason=body.reason.strip(),
        previous_tenant_id=previous,
    )
    tenant = next(t for t in svc.assigned_tenants(session) if t["id"] == str(body.tenant_id))
    session.commit()
    return {"tenant": tenant}


@router.post("/context/exit", tags=["personal interno"], responses=_STAFF_RESPONSES)
def exit_context(ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    previous = svc.previous_context_tenant(session)
    svc.audit(session, ctx, "context_exit", tenant_id=None, result="allowed", previous_tenant_id=previous)
    session.commit()
    return {"ok": True}


@router.get("/tenants/{tenant_id}/operations", tags=["personal interno"], responses=_STAFF_RESPONSES)
def staff_tenant_operations(tenant_id: UUID, ctx: StaffDep, session: DbDep) -> dict[str, Any]:
    _require(ctx, "operations.read")
    if not svc.tenant_visible(session, tenant_id):
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
    tenant_id: UUID, operation_id: UUID, ctx: StaffDep, session: DbDep
) -> dict[str, Any]:
    _require(ctx, "operations.read")
    if not svc.tenant_visible(session, tenant_id):
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
