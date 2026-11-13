-- =====================================================================================================
-- REVERSIÓN DE LOS DATOS DE DEMOSTRACIÓN (DEMO-A-0001 y DEMO-B-0001) · PORTAL CLIENTE LOGIXTIC
-- =====================================================================================================
-- Borra EXCLUSIVAMENTE las filas de las dos empresas de demostración (identificadores fijos por md5).
-- No toca: empresas reales, las nueve observaciones de logixtic_tenant_discovery, perfiles ni auditoría.
-- La auditoría de personal (staff_access_audit) se conserva: es inmutable. Sus filas quedan con tenant NULL.
-- Storage: los objetos de los documentos demo NO se borran aquí. Bórrelos con el procedimiento de Storage,
--   en el prefijo de cada empresa demo (ver docs/sql/portal_demo_seed_users.sql, sección de rutas).
-- Ejecutar en una transacción; si un recuento no cuadra, PostgreSQL revierte.
-- =====================================================================================================

BEGIN;

DO $$
DECLARE
  demo_ids uuid[] := ARRAY[md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid];
  foreign_rows int;
BEGIN
  -- Guarda: no borrar nada que no sea demostración. Si hay una empresa con IDs DEMO- distinta, se aborta.
  SELECT count(*) INTO foreign_rows FROM tenants
   WHERE external_tenant_id LIKE 'DEMO-%' AND NOT (id = ANY (demo_ids));
  IF foreign_rows > 0 THEN
    RAISE EXCEPTION 'Abortado: hay empresas con identificadores DEMO- que no son las de demostración.';
  END IF;
END $$;

DELETE FROM client_document_events WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM client_documents       WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM attachments            WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM event_comments         WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM requests               WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM operation_events       WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid)
                                     AND external_event_id LIKE 'DEMO-%';
DELETE FROM operation_refs         WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid)
                                     AND do_number LIKE 'DO-DEMO-%';
DELETE FROM client_memberships     WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM client_accounts        WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid)
                                     AND external_client_id LIKE 'DEMO-%';
DELETE FROM tenant_memberships     WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM staff_tenant_grants    WHERE tenant_id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid);
DELETE FROM tenants                WHERE id IN (md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid)
                                     AND external_tenant_id IN ('DEMO-A-0001', 'DEMO-B-0001');

-- Comprobación: no deben quedar filas de demostración.
DO $$
DECLARE left_rows int;
BEGIN
  SELECT (SELECT count(*) FROM tenants WHERE external_tenant_id IN ('DEMO-A-0001', 'DEMO-B-0001'))
       + (SELECT count(*) FROM operation_refs WHERE do_number LIKE 'DO-DEMO-%')
       + (SELECT count(*) FROM client_accounts WHERE external_client_id LIKE 'DEMO-%')
    INTO left_rows;
  IF left_rows <> 0 THEN
    RAISE EXCEPTION 'Quedan % filas de demostración: se revierte la reversión.', left_rows;
  END IF;
END $$;

COMMIT;
