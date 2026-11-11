"""Resolución del contexto de la petición: quién es la persona y en qué empresa actúa.

Responsabilidad: convertir las reclamaciones verificadas de un token en un `RequestContext`.

Reglas:

- La única fuente de tenant y rol es `tenant_memberships`. El cliente solo puede *elegir* entre
  empresas en las que ya tiene una membresía activa (cabecera `X-Tenant-Id`); nunca crear una.
- Si el usuario tiene varias empresas y no envía la cabecera, se responde 400 para que elija.
- Una empresa suspendida o un perfil deshabilitado deniegan el acceso aunque exista la membresía.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AccessDenied, AppError
from app.core.security import TokenClaims
from app.repositories import portal

COMMENT_ROLES = frozenset({"client_admin", "client_member"})


@dataclass(frozen=True)
class Membership:
    tenant_id: UUID
    role: str


@dataclass(frozen=True)
class RequestContext:
    user_id: UUID
    full_name: str
    tenant_id: UUID
    tenant_slug: str
    tenant_legal_name: str
    role: str
    memberships: tuple[Membership, ...]

    @property
    def can_comment(self) -> bool:
        return self.role in COMMENT_ROLES


def resolve_context(session: Session, claims: TokenClaims, requested_tenant: UUID | None) -> RequestContext:
    rows = portal.list_active_memberships(session, claims.subject)
    memberships = tuple(Membership(tenant_id=row.tenant_id, role=row.role) for row in rows)
    if not memberships:
        raise AccessDenied("Su usuario no tiene empresas asignadas.", code="no_tenant_membership")

    if requested_tenant is None:
        if len(memberships) > 1:
            raise AppError(
                "Indique la empresa con la cabecera X-Tenant-Id.",
                code="tenant_selection_required",
                status_code=400,
            )
        chosen = memberships[0]
    else:
        chosen = next((m for m in memberships if m.tenant_id == requested_tenant), None)
        if chosen is None:
            # Misma respuesta que una empresa inexistente: no se revela si el identificador existe.
            raise AccessDenied("No tiene acceso a la empresa indicada.", code="tenant_not_authorized")

    profile = portal.get_profile(session, claims.subject)
    if profile is None or profile.status != "active":
        raise AccessDenied("Su perfil no está activo.", code="profile_inactive")

    tenant = portal.get_tenant(session, chosen.tenant_id)
    if tenant is None or tenant.status != "active":
        raise AccessDenied("La empresa no está activa.", code="tenant_inactive")

    return RequestContext(
        user_id=claims.subject,
        full_name=profile.full_name,
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        tenant_legal_name=tenant.legal_name,
        role=chosen.role,
        memberships=memberships,
    )
