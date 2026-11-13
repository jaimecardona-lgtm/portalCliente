-- REVERSIÓN de 20261113000500_tenant_provisioning.
-- Se detiene si existen empresas dadas de alta desde el descubrimiento, registros creados desde el portal o
-- auditoría de creación: esos datos no se borran en silencio. Resolver antes de revertir.

DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM tenants WHERE discovery_observed_label IS NOT NULL)
         OR EXISTS (SELECT 1 FROM requests WHERE origin = 'portal_manual')
         OR EXISTS (SELECT 1 FROM client_accounts WHERE origin = 'portal_manual')
         OR EXISTS (SELECT 1 FROM staff_access_audit WHERE action = 'record_create') THEN
        RAISE EXCEPTION 'Reversión detenida: hay empresas dadas de alta o registros creados desde el portal.';
      END IF;
    END
    $$;

DROP POLICY IF EXISTS requests_staff_insert ON requests;
DROP POLICY IF EXISTS requests_staff_select ON requests;
DROP POLICY IF EXISTS client_accounts_staff_insert ON client_accounts;

ALTER TABLE requests DROP COLUMN IF EXISTS origin;
ALTER TABLE client_accounts DROP COLUMN IF EXISTS origin;

-- Alcance anterior (idéntico a 20261113000000).
CREATE OR REPLACE FUNCTION portal_staff_scope_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT t.id
      FROM tenants t
      JOIN platform_staff s ON s.user_id = portal_current_user_id()
      WHERE s.active AND s.tenant_scope = 'all_verified_support_tenants'
        AND s.staff_role IS NOT NULL
        AND t.verified_at IS NOT NULL AND t.status = 'active'
      UNION
      SELECT g.tenant_id
      FROM staff_tenant_grants g
      JOIN platform_staff s ON s.user_id = g.user_id
      JOIN tenants t ON t.id = g.tenant_id
      WHERE g.user_id = portal_current_user_id()
        AND g.active AND s.active
        AND t.verified_at IS NOT NULL AND t.status = 'active'
        AND s.staff_role IS NOT NULL
    $$;

DELETE FROM staff_role_permissions WHERE permission IN ('tenants.work_pending', 'records.write');
ALTER TABLE staff_role_permissions DROP CONSTRAINT IF EXISTS staff_role_permissions_permission_check;
ALTER TABLE staff_role_permissions ADD CONSTRAINT staff_role_permissions_permission_check CHECK (permission IN (
  'tenants.read', 'operations.read', 'documents.read', 'tenant_grants.manage'));

ALTER TABLE staff_access_audit DROP CONSTRAINT IF EXISTS staff_access_audit_action_check;
ALTER TABLE staff_access_audit ADD CONSTRAINT staff_access_audit_action_check CHECK (action IN (
  'context_select', 'context_exit', 'tenants_list', 'operations_list', 'context_denied'));

DROP INDEX IF EXISTS tenants_discovery_label_unique;
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_discovery_fk,
  DROP CONSTRAINT IF EXISTS tenants_discovery_pair,
  DROP COLUMN IF EXISTS integration_status,
  DROP COLUMN IF EXISTS is_demo,
  DROP COLUMN IF EXISTS discovery_source_system,
  DROP COLUMN IF EXISTS discovery_observed_label,
  DROP COLUMN IF EXISTS provisioned_authorized_by,
  DROP COLUMN IF EXISTS provisioned_at;

