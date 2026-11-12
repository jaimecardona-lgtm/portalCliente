-- REVERSIÓN de 20261112000000_client_scope. NO está en supabase/migrations: solo para uso manual y controlado.
-- Ejecutar únicamente sobre bases desechables o tras copia de seguridad. Restaura el aislamiento solo por tenant.

-- 1. Restaurar las políticas originales (de 20261111000000_foundation).
DROP POLICY IF EXISTS attachments_owner_insert ON attachments;
DROP POLICY IF EXISTS attachments_owner_or_request_select ON attachments;
DROP POLICY IF EXISTS requests_client_insert ON requests;
DROP POLICY IF EXISTS requests_owner_or_client_select ON requests;
DROP POLICY IF EXISTS event_comments_client_insert ON event_comments;
DROP POLICY IF EXISTS event_comments_client_select ON event_comments;
DROP POLICY IF EXISTS operation_events_client_select ON operation_events;
DROP POLICY IF EXISTS operation_refs_client_select ON operation_refs;
DROP POLICY IF EXISTS client_accounts_member_select ON client_accounts;
DROP POLICY IF EXISTS client_memberships_self_select ON client_memberships;

CREATE POLICY operation_refs_member_select ON operation_refs FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));

CREATE POLICY operation_events_member_select ON operation_events FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()) AND visibility = 'client');

CREATE POLICY event_comments_member_select ON event_comments FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()) AND visibility = 'client');

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

CREATE POLICY requests_member_select ON requests FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));

CREATE POLICY requests_member_insert ON requests FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND created_by = portal_current_user_id()
        AND status = 'recibida'
      );

CREATE POLICY attachments_member_select ON attachments FOR SELECT TO portal_app
      USING (tenant_id IN (SELECT portal_my_tenant_ids()));

CREATE POLICY attachments_member_insert ON attachments FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND uploaded_by = portal_current_user_id()
        AND status = 'pending'
      );

-- 2. Quitar la estructura nueva.
ALTER TABLE operation_refs DROP CONSTRAINT IF EXISTS operation_refs_client_fk;
DROP INDEX IF EXISTS ix_operation_refs_client;
ALTER TABLE operation_refs
  DROP COLUMN IF EXISTS sync_run_id,
  DROP COLUMN IF EXISTS source_version,
  DROP COLUMN IF EXISTS source_updated_at,
  DROP COLUMN IF EXISTS client_account_id;

DROP TABLE IF EXISTS client_memberships, client_accounts, sync_runs;

DROP FUNCTION IF EXISTS portal_my_client_account_ids();
