-- REVERSIÓN de 20261113000000_staff_global_tenant_scope. Solo para bases desechables o tras copia de seguridad.
-- Antes, confirmar que no hay alcances globales concedidos que deban conservarse:
--   SELECT user_id, scope_authorized_by FROM platform_staff WHERE tenant_scope <> 'assigned';
ALTER TABLE staff_access_audit DROP COLUMN IF EXISTS previous_tenant_id;
ALTER TABLE platform_staff
  DROP CONSTRAINT IF EXISTS platform_staff_scope_authorized,
  DROP COLUMN IF EXISTS scope_granted_at,
  DROP COLUMN IF EXISTS scope_authorized_by,
  DROP COLUMN IF EXISTS tenant_scope;
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
DROP FUNCTION IF EXISTS portal_staff_previous_context_tenant();
