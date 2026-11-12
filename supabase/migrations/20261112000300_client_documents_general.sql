-- 20261112000300_client_documents_general
-- Documentos generales del cliente final, sin operación de Logixtic asociada.
--
-- Motivo: todavía no hay integración oficial de DO desde el SaaS. Subir un documento general no debe exigir
-- una operación ficticia. Solo se relaja la obligatoriedad de `operation_id`; la autorización sigue siendo la
-- del cliente final asignado (RLS de client_documents, sin cambios).
--
-- No modifica migraciones aplicadas. Las políticas existentes ya dependen de client_account_id, no de la operación.

ALTER TABLE client_documents ALTER COLUMN operation_id DROP NOT NULL;

-- Un documento general no tiene operación; uno de operación sí. Ambos pertenecen a un cliente final.
-- La clave compuesta (operation_id, tenant_id, client_account_id) solo se evalúa cuando operation_id no es NULL.
