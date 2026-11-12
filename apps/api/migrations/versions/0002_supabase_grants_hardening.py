"""Endurecimiento de privilegios para Supabase: anon y authenticated no leen las tablas del portal.

Revision ID: 0002_supabase_grants_hardening
Revises: 0001_foundation
Create Date: 2026-11-11

Motivo: en Supabase, PostgREST expone el esquema `public` con los roles `anon` y `authenticated`, y ese
proyecto concede privilegios por defecto sobre las tablas y funciones nuevas. Las políticas RLS de la
migración 0001 están dirigidas solo a `portal_app`, así que `anon` y `authenticated` ya quedan sin filas;
esta migración añade la defensa en profundidad: sin privilegios de tabla ni de ejecución para esos roles.

Notas:

- Solo se revocan privilegios sobre las tablas y funciones de este proyecto, nunca sobre el esquema entero.
- Las sentencias son condicionales: en PostgreSQL local, donde esos roles no existen, no hacen nada.
- `service_role` NO se modifica aquí. La API no debe usarlo: ver `docs/supabase-preparation.md`.
- La reversión no restaura privilegios: dejar `anon`/`authenticated` sin acceso es el estado más seguro.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_supabase_grants_hardening"
down_revision: str | None = "0001_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_SQL: tuple[str, ...] = (
    # Tablas: sin ningún privilegio para los roles públicos de PostgREST.
    """
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON tenants, profiles, tenant_memberships, operation_refs, operation_events,
          event_comments, requests, attachments FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON tenants, profiles, tenant_memberships, operation_refs, operation_events,
          event_comments, requests, attachments FROM authenticated;
      END IF;
    END
    $$;
    """,
    # Funciones: PUBLIC conserva EXECUTE por defecto; se retira y se concede solo a portal_app.
    "REVOKE ALL ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() TO portal_app;",
    """
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE EXECUTE ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE EXECUTE ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() FROM authenticated;
      END IF;
    END
    $$;
    """,
)

DOWNGRADE_SQL: tuple[str, ...] = ()


def upgrade() -> None:
    for statement in UPGRADE_SQL:
        op.execute(statement)


def downgrade() -> None:
    # Sin operaciones: restaurar privilegios amplios sería menos seguro. Ver la nota del módulo.
    for statement in DOWNGRADE_SQL:
        op.execute(statement)
