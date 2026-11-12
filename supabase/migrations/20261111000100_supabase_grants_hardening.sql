-- 20261111000100_supabase_grants_hardening
-- Retira privilegios de anon, authenticated y PUBLIC.
-- Equivalente SQL de apps/api/migrations/versions/0002_supabase_grants_hardening.py (revision 0002_supabase_grants_hardening).
-- Fuente canónica: Supabase CLI. Alembic queda como referencia histórica.
-- Ver docs/database-migration-strategy.md.

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

REVOKE ALL ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION portal_current_user_id(), portal_my_tenant_ids() TO portal_app;

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
