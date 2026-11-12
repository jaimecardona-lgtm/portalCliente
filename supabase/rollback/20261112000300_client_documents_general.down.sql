-- REVERSIÓN de 20261112000300_client_documents_general. Solo sin documentos generales (operation_id NULL).
-- Confirmar antes: SELECT count(*) FROM client_documents WHERE operation_id IS NULL;  -- debe ser 0.
ALTER TABLE client_documents ALTER COLUMN operation_id SET NOT NULL;
