-- 20261113000500_tenant_provisioning
-- Alta administrativa de empresas SIN integración con Logixtic y sin operaciones.
--
-- Aditiva: no modifica filas existentes salvo añadir columnas derivadas y ampliar constraints.
-- - tenants.integration_status es una columna GENERADA a partir de verified_at: no puede contradecir la
--   verificación oficial. Pendiente = sin identificador oficial y sin fecha de verificación.
-- - Una empresa dada de alta desde el descubrimiento queda ligada por su etiqueta observada (no por el UUID
--   del descubrimiento ni por ningún identificador oficial). Solo una alta por etiqueta.
-- - tax_id sigue siendo obligatorio: el NIT lo aporta la autorización administrativa, nunca se inventa.
-- - Personal con permiso 'tenants.work_pending' y asignación explícita puede trabajar en empresas pendientes.
--   El alcance global 'all_verified_support_tenants' NO incluye empresas pendientes.
-- - Procedencia 'portal_manual' en cuentas de cliente y solicitudes creadas desde el portal. Nada de esto se
--   sincroniza hacia Logixtic.

-- ---------------------------------------------------------------------------
-- 1. Estado de integración y procedencia de tenants
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN integration_status text GENERATED ALWAYS AS (
    CASE WHEN verified_at IS NULL THEN 'pending_integration' ELSE 'verified' END
  ) STORED,
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN discovery_source_system text,
  ADD COLUMN discovery_observed_label text,
  ADD COLUMN provisioned_authorized_by text
    CHECK (provisioned_authorized_by IS NULL OR char_length(provisioned_authorized_by) BETWEEN 3 AND 200),
  ADD COLUMN provisioned_at timestamptz,
  ADD CONSTRAINT tenants_discovery_pair CHECK (
    (discovery_source_system IS NULL) = (discovery_observed_label IS NULL)
  ),
  ADD CONSTRAINT tenants_discovery_fk FOREIGN KEY (discovery_source_system, discovery_observed_label)
    REFERENCES logixtic_tenant_discovery (source_system, observed_label);

-- Una sola empresa por etiqueta observada: evita duplicar el alta.
CREATE UNIQUE INDEX tenants_discovery_label_unique
  ON tenants (discovery_source_system, discovery_observed_label)
  WHERE discovery_observed_label IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Permisos: trabajo en empresas pendientes y escritura de registros del portal
-- ---------------------------------------------------------------------------
ALTER TABLE staff_role_permissions DROP CONSTRAINT IF EXISTS staff_role_permissions_permission_check;
ALTER TABLE staff_role_permissions ADD CONSTRAINT staff_role_permissions_permission_check CHECK (permission IN (
  'tenants.read', 'operations.read', 'documents.read', 'tenant_grants.manage',
  'tenants.work_pending', 'records.write'));

INSERT INTO staff_role_permissions (staff_role, permission) VALUES
  ('platform_admin', 'tenants.work_pending'),
  ('platform_admin', 'records.write'),
  ('qa', 'tenants.work_pending'),
  ('qa', 'records.write')
ON CONFLICT DO NOTHING;

-- Auditoría: nueva acción de escritura de registros.
ALTER TABLE staff_access_audit DROP CONSTRAINT IF EXISTS staff_access_audit_action_check;
ALTER TABLE staff_access_audit ADD CONSTRAINT staff_access_audit_action_check CHECK (action IN (
  'context_select', 'context_exit', 'tenants_list', 'operations_list', 'context_denied', 'record_create'));

-- ---------------------------------------------------------------------------
-- 3. Alcance: empresas pendientes solo con permiso explícito y asignación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_staff_scope_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      -- Alcance global: solo empresas verificadas y activas.
      SELECT t.id
      FROM tenants t
      JOIN platform_staff s ON s.user_id = portal_current_user_id()
      WHERE s.active AND s.tenant_scope = 'all_verified_support_tenants'
        AND s.staff_role IS NOT NULL
        AND t.verified_at IS NOT NULL AND t.status = 'active'
      UNION
      -- Asignaciones explícitas: verificadas, o empresas dadas de alta desde el descubrimiento (pendientes)
      -- si el rol tiene 'tenants.work_pending'. Una empresa sin verificar y sin alta sigue invisible.
      SELECT g.tenant_id
      FROM staff_tenant_grants g
      JOIN platform_staff s ON s.user_id = g.user_id
      JOIN tenants t ON t.id = g.tenant_id
      WHERE g.user_id = portal_current_user_id()
        AND g.active AND s.active
        AND t.status = 'active'
        AND s.staff_role IS NOT NULL
        AND (
          t.verified_at IS NOT NULL
          OR (t.discovery_observed_label IS NOT NULL AND portal_staff_has_permission('tenants.work_pending'))
        )
    $$;

-- ---------------------------------------------------------------------------
-- 4. Procedencia y escritura del personal dentro del tenant seleccionado
-- ---------------------------------------------------------------------------
ALTER TABLE client_accounts
  ADD COLUMN origin text NOT NULL DEFAULT 'portal_manual'
    CHECK (origin IN ('portal_manual', 'logixtic_sync'));

ALTER TABLE requests
  ADD COLUMN origin text NOT NULL DEFAULT 'portal_manual'
    CHECK (origin IN ('portal_manual', 'logixtic_sync'));

CREATE POLICY client_accounts_staff_insert ON client_accounts FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('records.write')
        AND origin = 'portal_manual'
      );

CREATE POLICY requests_staff_select ON requests FOR SELECT TO portal_app
      USING (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('operations.read')
      );

CREATE POLICY requests_staff_insert ON requests FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('records.write')
        AND created_by = portal_current_user_id()
        AND status = 'recibida'
        AND origin = 'portal_manual'
      );

GRANT INSERT ON client_accounts TO portal_app;
GRANT INSERT ON requests TO portal_app;

-- ---------------------------------------------------------------------------
-- 5. Mínimos para la conexión de la aplicación (portal_api). Sin privilegios globales.
--    Solo se concede si el rol existe; el resto de privilegios ya viene de migraciones anteriores.
-- ---------------------------------------------------------------------------
DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_api') THEN
        GRANT portal_app TO portal_api;
      END IF;
    END
    $$;
