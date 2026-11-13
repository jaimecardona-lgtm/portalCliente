-- 20261112000400_platform_staff
-- RBAC del personal interno (Integratech). Separado de los roles de cliente (client_admin, client_member,
-- client_viewer), que no se modifican.
--
-- Principios:
-- - Solo AÑADE estructuras y amplía políticas. No modifica migraciones aplicadas.
-- - La identidad sale del JWT verificado por FastAPI; el rol interno se verifica en PostgreSQL. Nada de permisos
--   en user_metadata.
-- - Sin BYPASSRLS. Ningún rol de personal se crea con privilegios de superusuario.
-- - Un usuario interno NO recibe membresías de tenant ficticias: tiene asignaciones explícitas por tenant.
-- - Un tenant solo es visible para el personal si está VERIFICADO (identificador oficial y fecha) y ASIGNADO.
-- - El tenant seleccionado llega por contexto transaccional (set_config), que FastAPI fija tras validar la
--   asignación. Las funciones y políticas vuelven a comprobar la asignación en cada consulta.
-- - Revocar el rol (active = false) surte efecto en la siguiente consulta, sin esperar al token.

-- ---------------------------------------------------------------------------
-- 1. Verificación oficial de tenants (nuevo). Sin identificador oficial no hay acceso de personal.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN external_tenant_id text CHECK (external_tenant_id IS NULL OR char_length(external_tenant_id) BETWEEN 1 AND 100),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES profiles (id),
  ADD CONSTRAINT tenants_external_id_unique UNIQUE (external_tenant_id),
  ADD CONSTRAINT tenants_verified_has_external_id CHECK (verified_at IS NULL OR external_tenant_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. Personal interno
-- ---------------------------------------------------------------------------
CREATE TABLE platform_staff (
  user_id uuid PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  staff_role text NOT NULL CHECK (staff_role IN ('platform_admin', 'qa', 'developer', 'support')),
  active boolean NOT NULL DEFAULT false,
  authorized_by text NOT NULL CHECK (char_length(authorized_by) BETWEEN 3 AND 200),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text CHECK (revoked_reason IS NULL OR char_length(revoked_reason) <= 300),
  CONSTRAINT platform_staff_revocation_consistent CHECK (
    (active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL)
  )
);

-- Matriz de permisos tipados por rol (referencia versionada).
CREATE TABLE staff_role_permissions (
  staff_role text NOT NULL CHECK (staff_role IN ('platform_admin', 'qa', 'developer', 'support')),
  permission text NOT NULL CHECK (permission IN (
    'tenants.read', 'operations.read', 'documents.read', 'tenant_grants.manage')),
  PRIMARY KEY (staff_role, permission)
);

INSERT INTO staff_role_permissions (staff_role, permission) VALUES
  ('platform_admin', 'tenants.read'),
  ('platform_admin', 'operations.read'),
  ('platform_admin', 'documents.read'),
  ('platform_admin', 'tenant_grants.manage'),
  ('qa', 'tenants.read'),
  ('qa', 'operations.read'),
  ('qa', 'documents.read'),
  ('developer', 'tenants.read'),
  ('developer', 'operations.read'),
  ('support', 'tenants.read'),
  ('support', 'operations.read');

-- Asignación explícita de tenants a personal. Nunca implícita.
CREATE TABLE staff_tenant_grants (
  user_id uuid NOT NULL REFERENCES platform_staff (user_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  authorized_by text NOT NULL CHECK (char_length(authorized_by) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, tenant_id),
  CONSTRAINT staff_grant_revocation_consistent CHECK (
    (active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL)
  )
);

-- Auditoría de acciones de personal (sin lectura para el portal).
CREATE TABLE staff_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles (id),
  staff_role text NOT NULL CHECK (staff_role IN ('platform_admin', 'qa', 'developer', 'support')),
  tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'context_select', 'context_exit', 'tenants_list', 'operations_list', 'context_denied')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  result text NOT NULL CHECK (result IN ('allowed', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_tenant_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_access_audit ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Funciones de contexto (SECURITY DEFINER, con search_path fijo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_current_staff_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT s.staff_role
      FROM platform_staff s
      JOIN profiles p ON p.id = s.user_id
      WHERE s.user_id = portal_current_user_id() AND s.active AND p.status = 'active'
    $$;

CREATE OR REPLACE FUNCTION portal_staff_has_permission(p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM staff_role_permissions r
        WHERE r.staff_role = portal_current_staff_role() AND r.permission = p_permission
      )
    $$;

-- Tenants asignados al usuario interno, verificados y activos. Consulta fresca en cada llamada.
CREATE OR REPLACE FUNCTION portal_staff_scope_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT g.tenant_id
      FROM staff_tenant_grants g
      JOIN platform_staff s ON s.user_id = g.user_id
      JOIN tenants t ON t.id = g.tenant_id
      WHERE g.user_id = portal_current_user_id()
        AND g.active AND s.active
        AND t.verified_at IS NOT NULL AND t.status = 'active'
        AND s.staff_role IS NOT NULL
    $$;

-- Tenant de trabajo fijado por FastAPI para esta transacción. Vacío = ninguno.
CREATE OR REPLACE FUNCTION portal_staff_selected_tenant() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.staff_tenant_id', true), '')::uuid $$;

REVOKE ALL ON FUNCTION portal_current_staff_role(), portal_staff_has_permission(text),
  portal_staff_scope_tenant_ids(), portal_staff_selected_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_current_staff_role(), portal_staff_has_permission(text),
  portal_staff_scope_tenant_ids(), portal_staff_selected_tenant() TO portal_app;

-- ---------------------------------------------------------------------------
-- 4. Políticas RLS para el personal
-- ---------------------------------------------------------------------------
-- Ver el propio registro de personal (para saber el rol y si está activo).
CREATE POLICY platform_staff_self_select ON platform_staff FOR SELECT TO portal_app
      USING (user_id = portal_current_user_id());

CREATE POLICY staff_role_permissions_read ON staff_role_permissions FOR SELECT TO portal_app
      USING (staff_role = portal_current_staff_role());

CREATE POLICY staff_tenant_grants_self_select ON staff_tenant_grants FOR SELECT TO portal_app
      USING (user_id = portal_current_user_id());

CREATE POLICY staff_access_audit_insert ON staff_access_audit FOR INSERT TO portal_app
      WITH CHECK (actor_id = portal_current_user_id() AND staff_role = portal_current_staff_role());

-- Lista de tenants asignados, verificados y con permiso de lectura.
CREATE POLICY tenants_staff_list ON tenants FOR SELECT TO portal_app
      USING (
        id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('tenants.read')
      );

-- Operaciones: solo del tenant seleccionado, que además debe estar asignado.
CREATE POLICY operation_refs_staff_select ON operation_refs FOR SELECT TO portal_app
      USING (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('operations.read')
      );

CREATE POLICY client_accounts_staff_select ON client_accounts FOR SELECT TO portal_app
      USING (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('operations.read')
      );

-- ---------------------------------------------------------------------------
-- 5. Privilegios
-- ---------------------------------------------------------------------------
GRANT SELECT ON platform_staff, staff_role_permissions, staff_tenant_grants TO portal_app;
GRANT INSERT ON staff_access_audit TO portal_app;

DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON platform_staff, staff_role_permissions, staff_tenant_grants, staff_access_audit FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON platform_staff, staff_role_permissions, staff_tenant_grants, staff_access_audit FROM authenticated;
      END IF;
    END
    $$;

REVOKE ALL ON platform_staff, staff_role_permissions, staff_tenant_grants, staff_access_audit FROM PUBLIC;
