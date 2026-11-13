-- =====================================================================================================
-- PORTAL CLIENTE LOGIXTIC · DATOS DE DEMOSTRACIÓN · PARTE 2: CON USUARIOS (OPCIONAL)
-- =====================================================================================================
-- Requiere PARTE 1 (docs/sql/portal_demo_seed.sql) ejecutada antes y cuentas de Supabase Auth de DESARROLLO
-- creadas por el responsable (correo sintético, p. ej. cliente.a1@demo.invalid). Este script NO crea cuentas de
-- Auth: solo enlaza perfiles existentes con las empresas de demostración.
--
-- Antes de ejecutar: sustituya los seis UUID de la sección "CONFIGURACIÓN" por los de los perfiles existentes.
-- Si queda un marcador sin sustituir o falta un perfil, el script se detiene y no escribe nada.
--
-- Crea (solo demostración):
--   * Membresías de cliente final: 1 usuario por cuenta de cliente (A1, A2, B1, B2).
--   * 1 solicitud por empresa, vinculada a una operación.
--   * 2 documentos privados por empresa: metadatos, versión, estado y eventos. Los archivos van al bucket
--     privado logixtic-client-documents en las rutas indicadas al final (se suben aparte, no desde SQL).
-- Reversión: docs/sql/portal_demo_rollback.sql (borra estas filas por empresa demo).
-- =====================================================================================================

BEGIN;

-- ---------- CONFIGURACIÓN: sustituir por los UUID de los perfiles de desarrollo ----------
CREATE TEMP TABLE demo_users (key text PRIMARY KEY, user_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO demo_users (key, user_id) VALUES
  ('A1', '00000000-0000-0000-0000-00000000000a'),   -- <- sustituir: perfil del cliente A1
  ('A2', '00000000-0000-0000-0000-00000000000b'),   -- <- sustituir: perfil del cliente A2
  ('B1', '00000000-0000-0000-0000-00000000000c'),   -- <- sustituir: perfil del cliente B1
  ('B2', '00000000-0000-0000-0000-00000000000d');   -- <- sustituir: perfil del cliente B2

-- Guarda: los perfiles deben existir y ser de cuentas de demostración (correo .invalid o .test).
DO $$
DECLARE missing int;
BEGIN
  IF EXISTS (SELECT 1 FROM demo_users WHERE user_id::text LIKE '00000000-0000-0000-0000-00000000000%') THEN
    RAISE EXCEPTION 'Abortado: quedan UUID de marcador en la configuración. Sustitúyalos por perfiles reales de desarrollo.';
  END IF;
  SELECT count(*) INTO missing FROM demo_users d WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = d.user_id);
  IF missing > 0 THEN
    RAISE EXCEPTION 'Abortado: % perfil(es) no existen en profiles. Cree primero las cuentas de Auth de desarrollo.', missing;
  END IF;
  IF EXISTS (
    SELECT 1 FROM profiles p JOIN demo_users d ON d.user_id = p.id
    WHERE p.email NOT LIKE '%.invalid' AND p.email NOT LIKE '%.test'
  ) THEN
    RAISE EXCEPTION 'Abortado: un perfil configurado no tiene correo de demostración (.invalid o .test).';
  END IF;
END $$;

-- 1. Membresías de cliente final (tenant y cliente), sin tocar otras empresas.
INSERT INTO tenant_memberships (user_id, tenant_id, role, active)
SELECT d.user_id,
       CASE WHEN d.key LIKE 'A%' THEN md5('demo-tenant:DEMO-A-0001')::uuid ELSE md5('demo-tenant:DEMO-B-0001')::uuid END,
       'client_admin', true
FROM demo_users d
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role, active = true;

INSERT INTO client_memberships (tenant_id, client_account_id, user_id, role, active)
SELECT CASE WHEN d.key LIKE 'A%' THEN md5('demo-tenant:DEMO-A-0001')::uuid ELSE md5('demo-tenant:DEMO-B-0001')::uuid END,
       md5('demo-client:' || d.key)::uuid, d.user_id, 'client_admin', true
FROM demo_users d
ON CONFLICT (client_account_id, user_id) DO UPDATE SET active = true, role = EXCLUDED.role;

-- 2. Solicitudes: una por empresa, vinculada a su primera operación.
INSERT INTO requests (id, tenant_id, number, request_type, subject, description, operation_id, status, created_by)
SELECT md5('demo-request:' || t.key)::uuid, md5('demo-tenant:' || t.ext)::uuid,
       'SOL-DEMO-' || t.key, 'consulta', 'Consulta de demostración ' || t.key,
       'Solicitud sintética de demostración. No corresponde a un caso real.',
       md5('demo-op:' || t.op)::uuid, 'recibida',
       (SELECT user_id FROM demo_users WHERE key = t.cl)
FROM (VALUES
  ('A', 'DEMO-A-0001', 'A-1', 'A1'),
  ('B', 'DEMO-B-0001', 'B-1', 'B1')
) AS t(key, ext, op, cl)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, subject = EXCLUDED.subject;

-- 3. Documentos privados: metadatos por cliente. Ruta lógica: <tenant>/<cliente>/<operación>/<documento>.
INSERT INTO client_documents (id, tenant_id, client_account_id, operation_id, file_name, mime_type, size_bytes,
                              sha256, storage_bucket, storage_path, version, status, uploaded_by)
SELECT md5('demo-doc:' || x.key)::uuid,
       md5('demo-tenant:' || x.ext)::uuid,
       md5('demo-client:' || x.cl)::uuid,
       md5('demo-op:' || x.op)::uuid,
       x.file_name, 'application/pdf', 2048,
       encode(sha256(convert_to('demo-doc:' || x.key, 'UTF8')), 'hex'),
       'logixtic-client-documents',
       'demo/' || x.ext || '/' || x.cl || '/' || x.op || '/' || x.file_name,
       1, 'available', (SELECT user_id FROM demo_users WHERE key = x.cl)
FROM (VALUES
  ('A-1-factura', 'DEMO-A-0001', 'A1', 'A-1', 'factura-demo-A-1.pdf'),
  ('A-2-poliza',  'DEMO-A-0001', 'A1', 'A-2', 'poliza-demo-A-2.pdf'),
  ('B-1-factura', 'DEMO-B-0001', 'B1', 'B-1', 'factura-demo-B-1.pdf'),
  ('B-2-poliza',  'DEMO-B-0001', 'B1', 'B-2', 'poliza-demo-B-2.pdf')
) AS x(key, ext, cl, op, file_name)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, file_name = EXCLUDED.file_name;

INSERT INTO client_document_events (document_id, tenant_id, client_account_id, actor_id, action, version, sha256)
SELECT d.id, d.tenant_id, d.client_account_id, d.uploaded_by, 'uploaded', d.version, d.sha256
FROM client_documents d
WHERE d.storage_path LIKE 'demo/%'
  AND NOT EXISTS (SELECT 1 FROM client_document_events e WHERE e.document_id = d.id AND e.action = 'uploaded');

-- 4. Comprobación de recuentos del bloque.
DO $$
DECLARE n_mem int; n_req int; n_doc int;
BEGIN
  SELECT count(*) INTO n_mem FROM client_memberships WHERE client_account_id IN (
    SELECT md5('demo-client:' || key)::uuid FROM demo_users);
  SELECT count(*) INTO n_req FROM requests WHERE number LIKE 'SOL-DEMO-%';
  SELECT count(*) INTO n_doc FROM client_documents WHERE storage_path LIKE 'demo/%';
  IF n_mem <> 4 OR n_req <> 2 OR n_doc <> 4 THEN
    RAISE EXCEPTION 'Recuentos inesperados: membresías %, solicitudes %, documentos %', n_mem, n_req, n_doc;
  END IF;
END $$;

COMMIT;

-- Rutas de Storage a subir (bucket privado logixtic-client-documents, archivos PDF sintéticos de 2 KB):
--   demo/<tenant>/<cliente>/<operación>/<documento>
--   demo/md5(demo-tenant:DEMO-A-0001)/...  (los IDs reales salen de SELECT en client_documents)
-- Subir con el procedimiento de Storage. Ningún enlace público: las descargas usan URL firmadas temporales.
