-- 20261113000700_qa_request_creation
-- Alta de solicitudes por platform_admin, exclusivamente en el alcance QA sintético.
--
-- El permiso anterior `records.write` agrupaba escrituras distintas. Esta migración retira ese permiso
-- de la política de requests y lo sustituye por uno limitado a este flujo. No modifica el rol de ninguna
-- persona, no desactiva RLS y no habilita escrituras en tenants empresariales o verificados.

ALTER TABLE staff_role_permissions DROP CONSTRAINT IF EXISTS staff_role_permissions_permission_check;
ALTER TABLE staff_role_permissions ADD CONSTRAINT staff_role_permissions_permission_check CHECK (permission IN (
  'tenants.read', 'operations.read', 'documents.read', 'tenant_grants.manage',
  'tenants.work_pending', 'records.write', 'requests.create_qa'));

INSERT INTO staff_role_permissions (staff_role, permission)
VALUES ('platform_admin', 'requests.create_qa')
ON CONFLICT DO NOTHING;

ALTER TABLE staff_access_audit DROP CONSTRAINT IF EXISTS staff_access_audit_action_check;
ALTER TABLE staff_access_audit ADD CONSTRAINT staff_access_audit_action_check CHECK (action IN (
  'context_select', 'context_exit', 'tenants_list', 'operations_list', 'context_denied',
  'record_create', 'account_read'));

CREATE OR REPLACE FUNCTION portal_staff_can_create_qa_request(p_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM platform_staff s
        JOIN tenants t ON t.id = p_tenant_id
        WHERE s.user_id = portal_current_user_id()
          AND s.active
          AND s.staff_role = 'platform_admin'
          AND s.tenant_scope = 'qa_synthetic_only'
          AND portal_staff_has_permission('requests.create_qa')
          AND portal_qa_synthetic_enabled()
          AND t.status = 'active'
          AND t.segment = 'QA_SYNTHETIC_ONLY'
          AND t.id IN (SELECT portal_staff_scope_tenant_ids())
      )
    $$;

REVOKE ALL ON FUNCTION portal_staff_can_create_qa_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_staff_can_create_qa_request(uuid) TO portal_app;

DROP POLICY IF EXISTS requests_staff_insert ON requests;
CREATE POLICY requests_staff_qa_insert ON requests FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id = portal_staff_selected_tenant()
        AND portal_staff_can_create_qa_request(tenant_id)
        AND created_by = portal_current_user_id()
        AND status = 'recibida'
        AND origin = 'portal_manual'
      );

