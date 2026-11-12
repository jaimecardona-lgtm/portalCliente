-- REVERSIÓN de 20261111000000_foundation. NO está en supabase/migrations: solo para uso manual y controlado.
-- Ejecutar únicamente sobre bases desechables o tras copia de seguridad.

DROP TABLE IF EXISTS attachments, requests, event_comments, operation_events, operation_refs, tenant_memberships, profiles, tenants CASCADE;

DROP FUNCTION IF EXISTS portal_my_tenant_ids();

DROP FUNCTION IF EXISTS portal_current_user_id();
