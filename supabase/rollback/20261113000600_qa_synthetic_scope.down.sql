-- REVERSIÓN de 20261113000600_qa_synthetic_scope. Se detiene si hay personal con alcance QA.
DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM platform_staff WHERE tenant_scope = 'qa_synthetic_only') THEN
        RAISE EXCEPTION 'Reversión detenida: hay personal con alcance QA concedido.';
      END IF;
    END
    $$;

-- Alcance anterior (idéntico a 20261113000500).
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
        AND t.status = 'active'
        AND s.staff_role IS NOT NULL
        AND (
          t.verified_at IS NOT NULL
          OR (t.discovery_observed_label IS NOT NULL AND portal_staff_has_permission('tenants.work_pending'))
        )
    $$;

ALTER TABLE platform_staff DROP CONSTRAINT IF EXISTS platform_staff_qa_scope_role;
ALTER TABLE platform_staff DROP CONSTRAINT IF EXISTS platform_staff_tenant_scope_check;
ALTER TABLE platform_staff ADD CONSTRAINT platform_staff_tenant_scope_check CHECK (
  tenant_scope IN ('assigned', 'all_verified_support_tenants'));

DROP FUNCTION IF EXISTS portal_qa_synthetic_enabled();
DROP TABLE IF EXISTS portal_environment_flags;
