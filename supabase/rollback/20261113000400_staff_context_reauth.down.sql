-- REVERSIÓN de 20261113000400_staff_context_reauth. Conserva la auditoría existente: solo retira la columna nueva.
DROP FUNCTION IF EXISTS portal_confirm_context_change(uuid, timestamptz, text, uuid);
DROP FUNCTION IF EXISTS portal_request_context_challenge(uuid);
DROP TABLE IF EXISTS staff_reauth_uses;
DROP TABLE IF EXISTS staff_context_challenges;
ALTER TABLE staff_access_audit DROP COLUMN IF EXISTS reauthenticated_at;
