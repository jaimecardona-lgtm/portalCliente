"""Aprovisionamiento administrativo del personal interno. Solo con la conexión del PROPIETARIO del esquema.

Acciones: conceder o revocar rol interno, asignar o retirar tenants, y verificar un tenant con su
identificador
oficial. Cada acción exige una referencia de autorización escrita. No se usan UUID ni correos en el código:
todo
llega por argumentos o por el entorno del terminal del responsable.

Reglas:
- La cuenta debe existir en Supabase Auth (`auth.users`) cuando el esquema auth exista. En bases locales sin
  auth,
  debe existir el perfil. Nunca se crea una cuenta de Auth.
- Ninguna acción se ejecuta con roles del portal (portal_api, portal_app).
- Las salidas no muestran correos, identificadores ni datos personales.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

STAFF_ROLES = frozenset({"platform_admin", "qa", "developer", "support"})
PORTAL_ROLES = frozenset({"portal_api", "portal_app"})
_EXTERNAL_ID = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


class ProvisioningError(ValueError):
    """Error de validación o de estado. El mensaje es seguro para mostrar."""


@dataclass(frozen=True)
class Authorization:
    authorized_by: str
    reason: str

    def __post_init__(self) -> None:
        if not (3 <= len(self.authorized_by.strip()) <= 200):
            raise ProvisioningError("La referencia de autorización debe tener entre 3 y 200 caracteres.")
        if not (3 <= len(self.reason.strip()) <= 300):
            raise ProvisioningError("El motivo debe tener entre 3 y 300 caracteres.")


def assert_owner_connection(conn: Connection) -> None:
    current = conn.execute(text("SELECT current_user")).scalar()
    if current in PORTAL_ROLES:
        raise ProvisioningError("Use la conexión del propietario del esquema, no un rol del portal.")


def _auth_user_exists(conn: Connection, user_id: UUID) -> bool:
    has_auth = conn.execute(text("SELECT to_regclass('auth.users') IS NOT NULL")).scalar()
    if has_auth:
        return bool(
            conn.execute(
                text("SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = :u)"), {"u": user_id}
            ).scalar()
        )
    # Base sin Supabase Auth (desarrollo local): solo se acepta un perfil existente.
    return bool(
        conn.execute(text("SELECT EXISTS (SELECT 1 FROM profiles WHERE id = :u)"), {"u": user_id}).scalar()
    )


def _auth_email(conn: Connection, user_id: UUID) -> str | None:
    """Correo normalizado de Auth. Sin esquema auth (desarrollo local) no hay correo que tomar."""
    if not conn.execute(text("SELECT to_regclass('auth.users') IS NOT NULL")).scalar():
        return None
    row = conn.execute(text("SELECT lower(email) FROM auth.users WHERE id = :u"), {"u": user_id}).first()
    return row[0] if row and row[0] else None


def _require_account(conn: Connection, user_id: UUID) -> None:
    if not _auth_user_exists(conn, user_id):
        raise ProvisioningError("La cuenta no existe en Supabase Auth. No se crea ninguna cuenta desde aquí.")


def _tenant_id(conn: Connection, slug: str) -> UUID:
    if not _SLUG.match(slug):
        raise ProvisioningError("Identificador de empresa no válido.")
    row = conn.execute(text("SELECT id FROM tenants WHERE slug = :s"), {"s": slug}).first()
    if row is None:
        raise ProvisioningError("La empresa no existe en el portal.")
    return row[0]


def grant_staff(
    conn: Connection, user_id: UUID, staff_role: str, auth: Authorization, full_name: str | None
) -> str:
    if staff_role not in STAFF_ROLES:
        raise ProvisioningError("Rol interno no permitido.")
    _require_account(conn, user_id)
    profile = conn.execute(text("SELECT full_name FROM profiles WHERE id = :u"), {"u": user_id}).first()
    if profile is None:
        # El perfil se crea solo con el correo real de Auth y el nombre que aporta el responsable.
        if not full_name or not (2 <= len(full_name.strip()) <= 120):
            raise ProvisioningError("La cuenta no tiene perfil. Indique el nombre completo para crearlo.")
        email = _auth_email(conn, user_id)
        if email is None:
            raise ProvisioningError(
                "No se puede crear el perfil: la cuenta no tiene correo en Supabase Auth."
            )
        conn.execute(
            text("INSERT INTO profiles (id, email, full_name) VALUES (:u, :e, :n)"),
            {"u": user_id, "e": email, "n": full_name.strip()},
        )
    conn.execute(
        text(
            """
            INSERT INTO platform_staff (user_id, staff_role, active, authorized_by, granted_at)
            VALUES (:u, :r, true, :by, now())
            ON CONFLICT (user_id) DO UPDATE SET staff_role = EXCLUDED.staff_role, active = true,
                authorized_by = EXCLUDED.authorized_by, granted_at = now(), revoked_at = NULL,
                revoked_reason = NULL
            """
        ),
        {"u": user_id, "r": staff_role, "by": auth.authorized_by.strip()},
    )
    return "rol interno concedido"


def revoke_staff(conn: Connection, user_id: UUID, reason: str) -> str:
    if not (3 <= len(reason.strip()) <= 300):
        raise ProvisioningError("El motivo de revocación debe tener entre 3 y 300 caracteres.")
    result = conn.execute(
        text(
            """
            UPDATE platform_staff SET active = false, revoked_at = now(), revoked_reason = :reason
            WHERE user_id = :u AND active
            """
        ),
        {"u": user_id, "reason": reason.strip()},
    )
    if result.rowcount != 1:
        raise ProvisioningError("La cuenta no tiene un rol interno activo.")
    return "rol interno revocado: surte efecto en la siguiente petición"


def grant_tenant(conn: Connection, user_id: UUID, slug: str, auth: Authorization) -> str:
    tenant_id = _tenant_id(conn, slug)
    staff = conn.execute(text("SELECT active FROM platform_staff WHERE user_id = :u"), {"u": user_id}).first()
    if staff is None or not staff[0]:
        raise ProvisioningError("La cuenta no tiene un rol interno activo.")
    conn.execute(
        text(
            """
            INSERT INTO staff_tenant_grants (user_id, tenant_id, active, authorized_by, reason, granted_at)
            VALUES (:u, :t, true, :by, :reason, now())
            ON CONFLICT (user_id, tenant_id) DO UPDATE SET active = true,
                authorized_by = EXCLUDED.authorized_by,
                reason = EXCLUDED.reason, granted_at = now(), revoked_at = NULL
            """
        ),
        {"u": user_id, "t": tenant_id, "by": auth.authorized_by.strip(), "reason": auth.reason.strip()},
    )
    return "empresa asignada al personal"


def revoke_tenant(conn: Connection, user_id: UUID, slug: str, reason: str) -> str:
    tenant_id = _tenant_id(conn, slug)
    result = conn.execute(
        text(
            """
            UPDATE staff_tenant_grants SET active = false, revoked_at = now()
            WHERE user_id = :u AND tenant_id = :t AND active
            """
        ),
        {"u": user_id, "t": tenant_id},
    )
    if result.rowcount != 1:
        raise ProvisioningError("No hay una asignación activa para esa empresa.")
    return "asignación retirada"


def verify_tenant(conn: Connection, slug: str, external_id: str, verified_by: UUID | None) -> str:
    if not _EXTERNAL_ID.match(external_id):
        raise ProvisioningError("Identificador oficial no válido.")
    tenant_id = _tenant_id(conn, slug)
    duplicate = conn.execute(
        text("SELECT 1 FROM tenants WHERE external_tenant_id = :e AND id <> :t"),
        {"e": external_id, "t": tenant_id},
    ).first()
    if duplicate is not None:
        raise ProvisioningError("Ese identificador oficial ya está asociado a otra empresa.")
    conn.execute(
        text(
            """
            UPDATE tenants
            SET external_tenant_id = :e, verified_at = now(), verified_by = :v, updated_at = now()
            WHERE id = :t
            """
        ),
        {"e": external_id, "v": verified_by, "t": tenant_id},
    )
    return "empresa verificada con identificador oficial"


def grant_scope(conn: Connection, user_id: UUID, auth: Authorization) -> str:
    """Concede alcance global a todos los tenants verificados y activos. Exige rol interno activo."""
    staff = conn.execute(text("SELECT active FROM platform_staff WHERE user_id = :u"), {"u": user_id}).first()
    if staff is None or not staff[0]:
        raise ProvisioningError("La cuenta no tiene un rol interno activo.")
    conn.execute(
        text(
            """
            UPDATE platform_staff
            SET tenant_scope = 'all_verified_support_tenants',
                scope_authorized_by = :by,
                scope_granted_at = now()
            WHERE user_id = :u
            """
        ),
        {"u": user_id, "by": auth.authorized_by.strip()},
    )
    return "alcance global de soporte concedido"


def revoke_scope(conn: Connection, user_id: UUID, reason: str) -> str:
    """Retira el alcance global. Los grants específicos por tenant no se tocan."""
    if not (3 <= len(reason.strip()) <= 300):
        raise ProvisioningError("El motivo de revocación debe tener entre 3 y 300 caracteres.")
    result = conn.execute(
        text(
            """
            UPDATE platform_staff
            SET tenant_scope = 'assigned', scope_authorized_by = NULL, scope_granted_at = NULL
            WHERE user_id = :u AND tenant_scope <> 'assigned'
            """
        ),
        {"u": user_id},
    )
    if result.rowcount == 0:
        raise ProvisioningError("La cuenta no tiene alcance global que revocar.")
    return "alcance global de soporte revocado"
