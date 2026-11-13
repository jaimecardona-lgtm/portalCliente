"""Personal interno (RBAC de Integratech): identidad, permisos, tenants asignados y auditoría.

Responsabilidad: resolver si el usuario del JWT verificado es personal interno activo, qué permisos tiene y
qué tenants puede usar. Todo se consulta en PostgreSQL en cada petición: revocar el rol surte efecto de
inmediato.

Reglas: - Un usuario sin registro activo en `platform_staff` no es personal, aunque tenga token válido. - El
personal no recibe membresías de tenant. Su acceso son asignaciones explícitas (`staff_tenant_grants`). - Un
tenant solo es visible si está asignado, verificado (identificador oficial y fecha) y activo: lo filtra RLS.
- El tenant de trabajo se fija con `set_config` después de validar la asignación. Nunca se usa un encabezado
sin comprobar. - Cada acción sensible deja una fila en `staff_access_audit`, también los intentos
denegados."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class StaffContext:
    user_id: UUID
    full_name: str
    staff_role: str
    permissions: frozenset[str]

    def can(self, permission: str) -> bool:
        return permission in self.permissions


def resolve_staff(session: Session, user_id: UUID) -> StaffContext | None:
    row = (
        session.execute(
            text(
                """
            SELECT s.staff_role, p.full_name
            FROM platform_staff s JOIN profiles p ON p.id = s.user_id
            WHERE s.user_id = :u AND s.active AND p.status = 'active'
            """
            ),
            {"u": user_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    permissions = (
        session.execute(
            text("SELECT permission FROM staff_role_permissions WHERE staff_role = :r"),
            {"r": row["staff_role"]},
        )
        .scalars()
        .all()
    )
    return StaffContext(
        user_id=user_id,
        full_name=row["full_name"],
        staff_role=row["staff_role"],
        permissions=frozenset(permissions),
    )


def assigned_tenants(session: Session) -> list[dict[str, Any]]:
    """Tenants asignados, verificados y activos para la persona. La consulta la filtra RLS."""
    rows = (
        session.execute(
            text(
                """
            SELECT id, slug, legal_name, external_tenant_id, integration_status, is_demo,
                   discovery_observed_label
            FROM tenants
            ORDER BY legal_name, id
            """
            )
        )
        .mappings()
        .all()
    )
    return [_tenant_out(r) for r in rows]


def _tenant_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "slug": r["slug"],
        "legal_name": r["legal_name"],
        "external_tenant_id": r["external_tenant_id"],
        "integration_status": r["integration_status"],
        "is_demo": r["is_demo"],
        "discovery_observed_label": r["discovery_observed_label"],
    }


def _request_number() -> str:
    """Número legible y único por empresa (la restricción UNIQUE lo garantiza al insertar)."""
    from datetime import UTC
    from secrets import token_hex

    return f"SOL-{datetime.now(UTC).strftime('%y%m%d%H%M%S')}-{token_hex(2).upper()}"


def create_client_account(
    session: Session, ctx: StaffContext, tenant_id: UUID, legal_name: str, tax_id: str | None
) -> dict[str, Any]:
    """Cliente final creado desde el portal (procedencia portal_manual). RLS exige empresa seleccionada."""
    row = (
        session.execute(
            text(
                """
                INSERT INTO client_accounts (tenant_id, legal_name, tax_id, origin)
                VALUES (:t, :n, :x, 'portal_manual')
                RETURNING id, tenant_id, legal_name, tax_id, status, origin, created_at
                """
            ),
            {"t": tenant_id, "n": legal_name.strip(), "x": tax_id.strip() if tax_id else None},
        )
        .mappings()
        .one()
    )
    return _client_account_out(row)


def _client_account_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "tenant_id": str(r["tenant_id"]),
        "legal_name": r["legal_name"],
        "tax_id": r["tax_id"],
        "status": r["status"],
        "origin": r["origin"],
        "created_at": r["created_at"].isoformat(),
    }


def list_client_accounts(session: Session, tenant_id: UUID) -> list[dict[str, Any]]:
    rows = (
        session.execute(
            text(
                """
                SELECT id, tenant_id, legal_name, tax_id, status, origin, created_at
                FROM client_accounts WHERE tenant_id = :t ORDER BY legal_name, id
                """
            ),
            {"t": tenant_id},
        )
        .mappings()
        .all()
    )
    return [_client_account_out(r) for r in rows]


def create_request(
    session: Session,
    ctx: StaffContext,
    tenant_id: UUID,
    request_type: str,
    subject: str,
    description: str,
) -> dict[str, Any]:
    """Solicitud creada desde el portal (procedencia portal_manual, estado inicial 'recibida')."""
    row = (
        session.execute(
            text(
                """
                INSERT INTO requests (tenant_id, number, request_type, subject, description, status,
                                      created_by, origin)
                VALUES (:t, :n, :rt, :s, :d, 'recibida', :u, 'portal_manual')
                RETURNING id, tenant_id, number, request_type, subject, description, status, origin, created_at
                """
            ),
            {
                "t": tenant_id,
                "n": _request_number(),
                "rt": request_type,
                "s": subject.strip(),
                "d": description.strip(),
                "u": ctx.user_id,
            },
        )
        .mappings()
        .one()
    )
    return _request_out(row)


def _request_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "tenant_id": str(r["tenant_id"]),
        "number": r["number"],
        "request_type": r["request_type"],
        "subject": r["subject"],
        "description": r["description"],
        "status": r["status"],
        "origin": r["origin"],
        "created_at": r["created_at"].isoformat(),
    }


def list_requests(session: Session, tenant_id: UUID) -> list[dict[str, Any]]:
    rows = (
        session.execute(
            text(
                """
                SELECT id, tenant_id, number, request_type, subject, description, status, origin, created_at
                FROM requests WHERE tenant_id = :t ORDER BY created_at, id
                """
            ),
            {"t": tenant_id},
        )
        .mappings()
        .all()
    )
    return [_request_out(r) for r in rows]


def tenant_visible(session: Session, tenant_id: UUID) -> bool:
    row = session.execute(text("SELECT 1 FROM tenants WHERE id = :t"), {"t": tenant_id}).first()
    return row is not None


def fix_selected_tenant(session: Session, tenant_id: UUID) -> None:
    """Fija el tenant de trabajo de la transacción. Llamar solo después de comprobar `tenant_visible`."""
    session.execute(
        text("SELECT set_config('app.staff_tenant_id', :t, true)"),
        {"t": str(tenant_id)},
    )


def _operation_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "tenant_id": str(r["tenant_id"]),
        "do_number": r["do_number"],
        "reference": r["reference"],
        "last_known_status": r["last_known_status"],
        "last_synced_at": r["last_synced_at"].isoformat() if r["last_synced_at"] else None,
        "origin_name": r["origin_name"],
        "destination_name": r["destination_name"],
        "transport_type": r["transport_type"],
        "etd": r["etd"].isoformat() if r["etd"] else None,
        "eta": r["eta"].isoformat() if r["eta"] else None,
        "booking_number": r["booking_number"],
        "carrier_name": r["carrier_name"],
        "responsible_name": r["responsible_name"],
        "pending_client_response": r["pending_client_response"],
    }


def operations_of_selected_tenant(session: Session, tenant_id: UUID) -> list[dict[str, Any]]:
    """Operaciones del tenant seleccionado. RLS filtra por el tenant; el WHERE es defensa adicional."""
    rows = (
        session.execute(
            text(
                """
                SELECT id, tenant_id, do_number, reference, last_known_status, last_synced_at,
                       origin_name, destination_name, transport_type, etd, eta, booking_number,
                       carrier_name, responsible_name, pending_client_response
                FROM operation_refs WHERE tenant_id = :t ORDER BY do_number, id
                """
            ),
            {"t": tenant_id},
        )
        .mappings()
        .all()
    )
    return [_operation_out(r) for r in rows]


def events_of_selected_operation(
    session: Session, tenant_id: UUID, operation_id: UUID
) -> list[dict[str, Any]]:
    """Eventos visibles para el cliente de una operación del tenant seleccionado."""
    rows = (
        session.execute(
            text(
                """
            SELECT id, occurred_at, event_type, title, description, author_name, from_status, to_status
            FROM operation_events
            WHERE tenant_id = :t AND operation_id = :o
            ORDER BY occurred_at, id
            """
            ),
            {"t": tenant_id, "o": operation_id},
        )
        .mappings()
        .all()
    )
    return [
        {
            "id": str(r["id"]),
            "occurred_at": r["occurred_at"].isoformat(),
            "event_type": r["event_type"],
            "title": r["title"],
            "description": r["description"],
            "author_name": r["author_name"],
            "from_status": r["from_status"],
            "to_status": r["to_status"],
        }
        for r in rows
    ]


def previous_context_tenant(session: Session) -> UUID | None:
    """Último tenant de trabajo elegido por la persona (función SECURITY DEFINER)."""
    value = session.execute(text("SELECT portal_staff_previous_context_tenant()")).scalar()
    return UUID(str(value)) if value is not None else None


def audit(
    session: Session,
    ctx: StaffContext,
    action: str,
    *,
    tenant_id: UUID | None,
    result: str,
    reason: str | None = None,
    previous_tenant_id: UUID | None = None,
    reauthenticated_at: datetime | None = None,
) -> None:
    session.execute(
        text(
            """
            INSERT INTO staff_access_audit
              (actor_id, staff_role, tenant_id, previous_tenant_id, action, reason, result,
               reauthenticated_at)
            VALUES (:actor, :role, :tenant, :previous, :action, :reason, :result, :reauth)
            """
        ),
        {
            "actor": ctx.user_id,
            "role": ctx.staff_role,
            "tenant": tenant_id,
            "previous": previous_tenant_id,
            "reauth": reauthenticated_at,
            "action": action,
            "reason": reason,
            "result": result,
        },
    )


def observed_tenants(session: Session) -> list[dict[str, Any]]:
    """Catálogo de empresas observadas en Logixtic. Sin identificadores externos."""
    rows = session.execute(text("SELECT * FROM portal_observed_tenants()")).mappings().all()
    return [
        {
            "label": r["observed_label"],
            "slug": r["observed_slug"],
            "source_system": r["source_system"],
            "verification_status": r["verification_status"],
            "has_official_id": r["has_official_id"],
            "integration_status": r["integration_status"],
        }
        for r in rows
    ]


# Códigos que lanza la base de datos en el cambio de empresa. Se traducen a códigos de API estables.
_CONTEXT_ERRORS: dict[str, tuple[int, str]] = {
    "challenge_invalid": (403, "Este cambio ya no es válido. Vuelva a intentarlo."),
    "reauth_stale": (403, "La verificación de contraseña no es reciente. Vuelva a introducir su contraseña."),
    "reauth_reused": (403, "Esta verificación ya se utilizó. Vuelva a introducir su contraseña."),
    "tenant_not_authorized": (403, "No tiene acceso a la empresa indicada."),
    "rate_limited": (429, "Ha superado el número de intentos de cambio. Espere unos minutos."),
    "staff_required": (403, "Su usuario no tiene un rol interno autorizado."),
}


def _context_error(exc: Exception) -> Exception:
    from app.core.errors import AccessDenied, AppError

    message = str(getattr(exc, "orig", exc))
    for code, (status, text_message) in _CONTEXT_ERRORS.items():
        if code in message:
            if status == 429:
                return AppError(text_message, code="rate_limited", status_code=429)
            return AccessDenied(text_message, code=code)
    return exc


def request_context_challenge(session: Session, tenant_id: UUID) -> dict[str, Any]:
    from sqlalchemy.exc import DBAPIError

    try:
        row = (
            session.execute(
                text("SELECT challenge_id, expires_at FROM portal_request_context_challenge(:t)"),
                {"t": tenant_id},
            )
            .mappings()
            .one()
        )
    except DBAPIError as exc:
        raise _context_error(exc) from exc
    return {"challenge_id": str(row["challenge_id"]), "expires_at": row["expires_at"].isoformat()}


def confirm_context_change(
    session: Session, challenge_id: UUID, reauth_at: datetime, fingerprint: str, previous: UUID | None
) -> UUID:
    from sqlalchemy.exc import DBAPIError

    try:
        value = session.execute(
            text("SELECT portal_confirm_context_change(:c, :r, :f, :p)"),
            {"c": challenge_id, "r": reauth_at, "f": fingerprint, "p": previous},
        ).scalar_one()
    except DBAPIError as exc:
        raise _context_error(exc) from exc
    return UUID(str(value))
