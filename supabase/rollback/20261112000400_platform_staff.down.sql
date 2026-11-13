-- REVERSIÓN de 20261112000400_platform_staff. Solo para bases desechables o tras copia de seguridad.
-- Antes, confirmar que no hay auditoría de personal que conservar:
--   SELECT count(*) FROM staff_access_audit;  -- si es > 0, exportarla antes.
DROP POLICY IF EXISTS staff_access_audit_insert ON staff_access_audit;
DROP POLICY IF EXISTS operation_refs_staff_select ON operation_refs;
DROP POLICY IF EXISTS client_accounts_staff_select ON client_accounts;
DROP POLICY IF EXISTS tenants_staff_list ON tenants;
DROP TABLE IF EXISTS staff_access_audit, staff_tenant_grants, staff_role_permissions, platform_staff CASCADE;
DROP FUNCTION IF EXISTS portal_current_staff_role();
DROP FUNCTION IF EXISTS portal_staff_has_permission(text);
DROP FUNCTION IF EXISTS portal_staff_scope_tenant_ids();
DROP FUNCTION IF EXISTS portal_staff_selected_tenant();
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_verified_has_external_id,
  DROP CONSTRAINT IF EXISTS tenants_external_id_unique,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS external_tenant_id;
