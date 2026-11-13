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
--   * NO crea documentos: se suben por la API después de crear el objeto en el bucket privado
--     logixtic-client-documents (ruta demo/<tenant>/<cliente>/<operación>/<archivo>).
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

-- 3. Documentos: NO se registran aquí. Cada documento se crea con el flujo de subida de la API,
--    que escribe primero el objeto en Storage y después sus metadatos (client_documents). Así nunca
--    existe un documento 'disponible' sin archivo real.

-- 4. Comprobación de recuentos del bloque.
DO $$
DECLARE n_mem int; n_req int; n_doc int;
BEGIN
  SELECT count(*) INTO n_mem FROM client_memberships WHERE client_account_id IN (
    SELECT md5('demo-client:' || key)::uuid FROM demo_users);
  SELECT count(*) INTO n_req FROM requests WHERE number LIKE 'SOL-DEMO-%';
  SELECT count(*) INTO n_doc FROM client_documents WHERE storage_path LIKE 'demo/%';
  IF n_mem <> 4 OR n_req <> 2 OR n_doc <> 0 THEN
    RAISE EXCEPTION 'Recuentos inesperados: membresías %, solicitudes %, documentos %', n_mem, n_req, n_doc;
  END IF;
END $$;

COMMIT;

-- Documentos de demostración (fuera de este SQL): subir PDF sintéticos al bucket privado con el procedimiento
-- de Storage y registrarlos con la API de documentos. Ruta: demo/<tenant>/<cliente>/<operación>/<archivo>.
-- Ningún enlace público: las descargas usan URL firmadas temporales.
