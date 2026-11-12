-- REVERSIÓN de 20261112000200_client_documents. NO está en supabase/migrations.
-- Solo para bases desechables o tras copia de seguridad. Antes, confirmar que no hay documentos reales:
--   SELECT count(*) FROM client_documents;  -- debe ser 0 para una reversión sin pérdida.
-- Los objetos de Storage NO se borran con SQL: si existen, hay que retirarlos con la API de Storage.
DROP TABLE IF EXISTS client_document_events, storage_cleanup_jobs, client_documents CASCADE;
DROP FUNCTION IF EXISTS portal_my_client_admin_account_ids();
ALTER TABLE operation_refs DROP CONSTRAINT IF EXISTS operation_refs_scope_key;
