"""Esquema inicial del portal: tenants, membresías, referencias de operación, comentarios por evento,
solicitudes y adjuntos, con claves compuestas, restricciones y Row Level Security.

Revision ID: 0001_foundation
Revises:
Create Date: 2026-11-11

Notas para quien mantenga la migración:

- `portal_current_user_id()` lee `app.current_user_id`, que FastAPI fija con `set_config` por
  transacción.
- `portal_my_tenant_ids()` es SECURITY DEFINER para evitar recursión de RLS sobre `tenant_memberships`.
  Solo devuelve tenants del usuario indicado por `app.current_user_id`, así que no amplía el acceso.
- El rol `portal_app` no tiene BYPASSRLS. La API ejecuta sus consultas con ese rol.
- Si existe el esquema `auth` (Supabase), `profiles.id` se vincula a `auth.users(id)`.
- Esta migración no inserta datos. Los tenants y usuarios se aprovisionan por separado.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_foundation"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_SQL: tuple[str, ...] = (
    # --- Rol de aplicación sin BYPASSRLS -------------------------------------------------
    """
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
        CREATE ROLE portal_app NOLOGIN NOBYPASSRLS;
      END IF;
    END
    $$;
    """,
    "GRANT portal_app TO CURRENT_USER;",
    # --- Tablas --------------------------------------------------------------------------
    """
    CREATE TABLE tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
      legal_name text NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 200),
      tax_id text NOT NULL CHECK (char_length(tax_id) BETWEEN 3 AND 40),
      country text,
      city text,
      segment text,
      account_manager text,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    """,
    """
    CREATE TABLE profiles (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE CHECK (email = lower(email)),
      full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      terms_version_accepted text,
      terms_accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    """,
    """
    DO $$
    BEGIN
      IF to_regclass('auth.users') IS NOT NULL THEN
        ALTER TABLE profiles
          ADD CONSTRAINT profiles_auth_user_fk
          FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
      END IF;
    END
    $$;
    """,
    """
    CREATE TABLE tenant_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('client_admin', 'client_member', 'client_viewer')),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, tenant_id)
    );
    """,
    "CREATE INDEX ix_tenant_memberships_user_active ON tenant_memberships (user_id) WHERE active;",
    """
    CREATE TABLE operation_refs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      external_system text NOT NULL DEFAULT 'logixtic' CHECK (external_system = 'logixtic'),
      external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 100),
      do_number text NOT NULL CHECK (char_length(do_number) BETWEEN 1 AND 40),
      reference text,
      last_known_status text,
      last_synced_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, external_system, external_id),
      UNIQUE (tenant_id, do_number),
      UNIQUE (id, tenant_id)
    );
    """,
    """
    CREATE TABLE operation_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      operation_id uuid NOT NULL,
      external_event_id text NOT NULL CHECK (char_length(external_event_id) BETWEEN 1 AND 100),
      event_type text NOT NULL CHECK (event_type IN ('status_change', 'news', 'document', 'action_required')),
      occurred_at timestamptz NOT NULL,
      title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
      description text,
      author_name text,
      from_status text,
      to_status text,
      visibility text NOT NULL DEFAULT 'client' CHECK (visibility IN ('client', 'internal')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, external_event_id),
      UNIQUE (id, tenant_id, operation_id),
      FOREIGN KEY (operation_id, tenant_id) REFERENCES operation_refs (id, tenant_id) ON DELETE CASCADE
    );
    """,
    "CREATE INDEX ix_operation_events_timeline ON operation_events (tenant_id, operation_id, occurred_at);",
    """
    CREATE TABLE event_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      operation_id uuid NOT NULL,
      event_id uuid NOT NULL,
      parent_comment_id uuid,
      author_id uuid NOT NULL REFERENCES profiles (id),
      author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 120),
      author_side text NOT NULL CHECK (author_side IN ('client', 'operator')),
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      visibility text NOT NULL DEFAULT 'client' CHECK (visibility IN ('client', 'internal')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, tenant_id, event_id),
      FOREIGN KEY (event_id, tenant_id, operation_id)
        REFERENCES operation_events (id, tenant_id, operation_id) ON DELETE CASCADE,
      FOREIGN KEY (operation_id, tenant_id) REFERENCES operation_refs (id, tenant_id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id, tenant_id, event_id)
        REFERENCES event_comments (id, tenant_id, event_id) ON DELETE CASCADE
    );
    """,
    "CREATE INDEX ix_event_comments_thread ON event_comments (tenant_id, event_id, created_at);",
    """
    CREATE TABLE requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      number text NOT NULL CHECK (char_length(number) BETWEEN 1 AND 30),
      request_type text NOT NULL CHECK (
        request_type IN ('consulta', 'modificacion_datos', 'documentacion', 'cotizacion', 'otro')
      ),
      subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 120),
      description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
      operation_id uuid,
      status text NOT NULL DEFAULT 'recibida' CHECK (
        status IN ('recibida', 'en_revision', 'respondida', 'cerrada')
      ),
      created_by uuid NOT NULL REFERENCES profiles (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, number),
      UNIQUE (id, tenant_id),
      FOREIGN KEY (operation_id, tenant_id) REFERENCES operation_refs (id, tenant_id)
    );
    """,
    """
    CREATE TABLE attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
      request_id uuid,
      storage_path text NOT NULL UNIQUE,
      file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
      mime_type text NOT NULL CHECK (mime_type IN (
        'application/pdf', 'image/png', 'image/jpeg',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
      size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
      sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'rejected')),
      uploaded_by uuid NOT NULL REFERENCES profiles (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (request_id, tenant_id) REFERENCES requests (id, tenant_id) ON DELETE CASCADE
    );
    """,
    # --- Funciones de contexto -----------------------------------------------------------
    """
    CREATE OR REPLACE FUNCTION portal_current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;
    """,
    """
    CREATE OR REPLACE FUNCTION portal_my_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT m.tenant_id
      FROM tenant_memberships m
      WHERE m.user_id = portal_current_user_id() AND m.active
    $$;
    """,
    # --- Row Level Security --------------------------------------------------------------
    "ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE operation_refs ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE requests ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY profiles_self_select ON profiles FOR SELECT TO portal_app
      USING (id = portal_current_user_id());
    """,
    """
    CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO portal_app
      USING (id = portal_current_user_id()) WITH CHECK (id = portal_current_user_id());
    """,
    """
    CREATE POLICY memberships_self_select ON tenant_memberships FOR SELECT TO portal_app
      USING (user_id = portal_current_user_id());
    """,
    """
    CREATE POLICY tenants_member_select ON tenants FOR SELECT TO portal_app
      USING (id IN (SELECT portal_my_tenant_ids()));
    """,
    """
    CREATE POLICY operation_refs_member_select ON operation_refs FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));
    """,
    """
    CREATE POLICY operation_events_member_select ON operation_events FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()) AND visibility = 'client');
    """,
    """
    CREATE POLICY event_comments_member_select ON event_comments FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()) AND visibility = 'client');
    """,
    """
    CREATE POLICY event_comments_member_insert ON event_comments FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND author_id = portal_current_user_id()
        AND author_side = 'client'
        AND visibility = 'client'
        AND EXISTS (
          SELECT 1 FROM tenant_memberships m
          WHERE m.user_id = author_id AND m.tenant_id = event_comments.tenant_id
            AND m.active AND m.role IN ('client_admin', 'client_member')
        )
        AND EXISTS (
          SELECT 1 FROM operation_events e
          WHERE e.id = event_comments.event_id AND e.tenant_id = event_comments.tenant_id
            AND e.visibility = 'client'
        )
      );
    """,
    """
    CREATE POLICY requests_member_select ON requests FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));
    """,
    """
    CREATE POLICY requests_member_insert ON requests FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND created_by = portal_current_user_id()
        AND status = 'recibida'
      );
    """,
    """
    CREATE POLICY attachments_member_select ON attachments FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));
    """,
    """
    CREATE POLICY attachments_member_insert ON attachments FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND uploaded_by = portal_current_user_id()
        AND status = 'pending'
      );
    """,
    # --- Permisos mínimos para el rol de aplicación --------------------------------------
    "GRANT USAGE ON SCHEMA public TO portal_app;",
    "GRANT SELECT ON tenants, profiles, tenant_memberships, operation_refs, operation_events, "
    "event_comments, requests, attachments TO portal_app;",
    "GRANT INSERT ON event_comments, requests, attachments TO portal_app;",
    "GRANT UPDATE (full_name, updated_at) ON profiles TO portal_app;",
    "GRANT EXECUTE ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() TO portal_app;",
)

DOWNGRADE_SQL: tuple[str, ...] = (
    "DROP TABLE IF EXISTS attachments, requests, event_comments, operation_events, operation_refs, "
    "tenant_memberships, profiles, tenants CASCADE;",
    "DROP FUNCTION IF EXISTS portal_my_tenant_ids();",
    "DROP FUNCTION IF EXISTS portal_current_user_id();",
    # El rol portal_app no se elimina: puede tener otras dependencias fuera de este proyecto.
)


def upgrade() -> None:
    for statement in UPGRADE_SQL:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_SQL:
        op.execute(statement)
