"""Aprovisionamiento controlado de datos de desarrollo: empresa, perfil, membresía y operación sintética.

Responsabilidad: crear o actualizar (de forma idempotente) las filas mínimas para que una persona de
Supabase Auth pueda iniciar sesión en el portal. No crea credenciales ni cuentas de Supabase.

Reglas:

- El identificador de perfil debe ser el `id` de un usuario ya existente en Supabase Auth (creado por
  invitación o desde el panel). Esta función no lo inventa ni lo verifica contra Supabase.
- Todos los valores de ejemplo son sintéticos: dominios `.test`, nombres ficticios y NIT de ejemplo.
- Se ejecuta con una conexión del propietario del esquema (no con `portal_app`), porque debe escribir
  en tablas que RLS protege.
- Nunca recibe ni guarda contraseñas, tokens ni claves.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID, uuid5

from sqlalchemy import Connection, text

ALLOWED_ROLES = frozenset({"client_admin", "client_member", "client_viewer"})
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
_NAMESPACE = UUID("6f1c2a3e-8d4b-4c7a-9e21-0b5d7f3a9c10")  # espacio fijo para ids sintéticos


CLIENT_ROLES = frozenset({"client_admin", "client_viewer"})


@dataclass(frozen=True)
class DevMembership:
    user_id: UUID
    email: str
    full_name: str
    tenant_slug: str
    tenant_legal_name: str
    tenant_tax_id: str
    role: str
    # Cliente final (nivel B). Sin cliente, la persona no ve ninguna operación del tenant.
    client_legal_name: str | None = None
    client_tax_id: str | None = None
    client_role: str = "client_admin"


def client_account_id(tenant_slug: str, client_legal_name: str) -> UUID:
    """Identificador determinista del cliente final dentro de una empresa (idempotencia)."""
    return uuid5(_NAMESPACE, f"client:{tenant_slug}:{client_legal_name.strip()}")


def _validate(member: DevMembership) -> DevMembership:
    if member.role not in ALLOWED_ROLES:
        raise ValueError("Rol no permitido.")
    if not _SLUG.match(member.tenant_slug):
        raise ValueError("Identificador de empresa no válido.")
    email = member.email.strip().lower()
    if "@" not in email or len(email) > 254:
        raise ValueError("Correo no válido.")
    if not (2 <= len(member.full_name.strip()) <= 120):
        raise ValueError("Nombre no válido.")
    client_name = member.client_legal_name.strip() if member.client_legal_name else None
    if client_name is not None and not (2 <= len(client_name) <= 200):
        raise ValueError("Razón social del cliente no válida.")
    if member.client_role not in CLIENT_ROLES:
        raise ValueError("Rol de cliente no permitido.")
    return DevMembership(
        user_id=member.user_id,
        email=email,
        full_name=member.full_name.strip(),
        tenant_slug=member.tenant_slug,
        tenant_legal_name=member.tenant_legal_name.strip(),
        tenant_tax_id=member.tenant_tax_id.strip(),
        role=member.role,
        client_legal_name=client_name,
        client_tax_id=member.client_tax_id.strip() if member.client_tax_id else None,
        client_role=member.client_role,
    )


def provision_membership(conn: Connection, member: DevMembership) -> UUID:
    """Crea o actualiza empresa, perfil y membresía. Devuelve el id de la empresa."""
    m = _validate(member)
    tenant_id = conn.execute(
        text(
            """
            INSERT INTO tenants (slug, legal_name, tax_id)
            VALUES (:slug, :legal_name, :tax_id)
            ON CONFLICT (slug) DO UPDATE SET legal_name = EXCLUDED.legal_name, updated_at = now()
            RETURNING id
            """
        ),
        {"slug": m.tenant_slug, "legal_name": m.tenant_legal_name, "tax_id": m.tenant_tax_id},
    ).scalar_one()
    conn.execute(
        text(
            """
            INSERT INTO profiles (id, email, full_name)
            VALUES (:id, :email, :full_name)
            ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
            """
        ),
        {"id": m.user_id, "email": m.email, "full_name": m.full_name},
    )
    conn.execute(
        text(
            """
            INSERT INTO tenant_memberships (user_id, tenant_id, role, active)
            VALUES (:user_id, :tenant_id, :role, true)
            ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role, active = true
            """
        ),
        {"user_id": m.user_id, "tenant_id": tenant_id, "role": m.role},
    )
    if m.client_legal_name:
        client_id = client_account_id(m.tenant_slug, m.client_legal_name)
        conn.execute(
            text(
                """
                INSERT INTO client_accounts (id, tenant_id, legal_name, tax_id)
                VALUES (:id, :tenant_id, :legal_name, :tax_id)
                ON CONFLICT (id) DO UPDATE SET legal_name = EXCLUDED.legal_name,
                    tax_id = EXCLUDED.tax_id, updated_at = now()
                """
            ),
            {
                "id": client_id,
                "tenant_id": tenant_id,
                "legal_name": m.client_legal_name,
                "tax_id": m.client_tax_id,
            },
        )
        # La clave compuesta (user_id, tenant_id) exige que la persona ya sea miembro del tenant.
        conn.execute(
            text(
                """
                INSERT INTO client_memberships (tenant_id, client_account_id, user_id, role, active)
                VALUES (:tenant_id, :client_id, :user_id, :role, true)
                ON CONFLICT (client_account_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true
                """
            ),
            {
                "tenant_id": tenant_id,
                "client_id": client_id,
                "user_id": m.user_id,
                "role": m.client_role,
            },
        )
    return tenant_id  # type: ignore[no-any-return]


def provision_synthetic_operation(
    conn: Connection, tenant_slug: str, client_legal_name: str | None = None
) -> UUID:
    """Crea una operación y un evento sintéticos para una empresa. Idempotente.

    Los identificadores son deterministas (uuid5 por empresa), así que repetir la llamada no duplica nada.
    Los datos son ficticios y solo sirven para probar el flujo de extremo a extremo.
    """
    if not _SLUG.match(tenant_slug):
        raise ValueError("Identificador de empresa no válido.")
    tenant_id = conn.execute(
        text("SELECT id FROM tenants WHERE slug = :slug"), {"slug": tenant_slug}
    ).scalar_one()
    operation_id = uuid5(_NAMESPACE, f"op:{tenant_slug}")
    event_id = uuid5(_NAMESPACE, f"ev:{tenant_slug}")
    conn.execute(
        text(
            """
            INSERT INTO operation_refs (id, tenant_id, external_id, do_number, reference, last_known_status,
                                        client_account_id)
            VALUES (:id, :tenant_id, :external_id, :do_number, :reference, :status, :client_id)
            ON CONFLICT (tenant_id, external_system, external_id) DO NOTHING
            """
        ),
        {
            "id": operation_id,
            "tenant_id": tenant_id,
            "external_id": f"SYN-{tenant_slug}-1",
            "do_number": f"DO-SYN-{tenant_slug[:8]}-1",
            "reference": "Operación sintética de prueba",
            "status": "En tránsito",
            # Sin cliente indicado, la operación no es visible para ninguna persona del portal.
            "client_id": client_account_id(tenant_slug, client_legal_name) if client_legal_name else None,
        },
    )
    conn.execute(
        text(
            """
            INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type,
                                          occurred_at, title, to_status, visibility)
            VALUES (:id, :tenant_id, :operation_id, :external_event_id, 'status_change',
                    now(), 'Salida de origen (sintética)', 'En tránsito', 'client')
            ON CONFLICT (tenant_id, external_event_id) DO NOTHING
            """
        ),
        {
            "id": event_id,
            "tenant_id": tenant_id,
            "operation_id": operation_id,
            "external_event_id": f"SYN-{tenant_slug}-EV-1",
        },
    )
    return operation_id
