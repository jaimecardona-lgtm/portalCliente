-- FASE 13 · ESTADO REMOTO (SOLO LECTURA). Ejecutar como propietario en Supabase SQL Editor.
-- No modifica nada. No muestra filas de datos: solo metadatos, nombres, booleanos y recuentos.
-- Pegue el resultado completo. Si aparece un valor personal o empresarial, sustitúyalo por [oculto].

-- 1. Historial de migraciones registrado por la CLI.
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- 2. Existencia de objetos esperados por las migraciones pendientes.
SELECT o.name, to_regclass('public.' || o.name) IS NOT NULL AS existe
FROM (VALUES
  ('logixtic_tenant_discovery'), ('client_accounts'), ('client_memberships'), ('sync_runs'),
  ('client_documents'), ('client_document_events'), ('storage_cleanup_jobs')
) AS o(name);

SELECT p.proname AS funcion, p.prosecdef AS security_definer,
       pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('portal_my_client_account_ids', 'portal_my_client_admin_account_ids', 'portal_my_tenant_ids', 'portal_current_user_id');

-- 3. Columnas de las tablas nuevas y de operation_refs (tipos, nulidad y defaults; sin datos).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('client_documents', 'client_document_events', 'storage_cleanup_jobs',
                     'client_accounts', 'client_memberships', 'sync_runs', 'operation_refs', 'logixtic_tenant_discovery')
ORDER BY table_name, ordinal_position;

-- 4. Restricciones (nombre, tipo y definición).
SELECT conrelid::regclass AS tabla, conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN (
  'public.client_documents'::regclass, 'public.client_document_events'::regclass,
  'public.storage_cleanup_jobs'::regclass, 'public.client_accounts'::regclass,
  'public.client_memberships'::regclass, 'public.sync_runs'::regclass,
  'public.operation_refs'::regclass, 'public.logixtic_tenant_discovery'::regclass)
ORDER BY tabla::text, conname;

-- 5. Índices (nombre y definición).
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('client_documents', 'client_document_events', 'storage_cleanup_jobs',
                    'client_accounts', 'client_memberships', 'sync_runs', 'operation_refs', 'logixtic_tenant_discovery')
ORDER BY tablename, indexname;

-- 6. RLS activa y forzada por tabla.
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activa, c.relforcerowsecurity AS rls_forzada
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('client_documents', 'client_document_events', 'storage_cleanup_jobs',
                    'client_accounts', 'client_memberships', 'sync_runs', 'logixtic_tenant_discovery')
ORDER BY tabla;

-- 7. Políticas RLS (nombre, comando y roles).
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT count(*) AS politicas_totales FROM pg_policies WHERE schemaname = 'public';

-- 8. Privilegios directos sobre las tablas nuevas (ACL). Un grantee vacío significa PUBLIC.
SELECT c.relname AS tabla,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS concedido_a,
       a.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public'
  AND c.relname IN ('client_documents', 'client_document_events', 'storage_cleanup_jobs',
                    'client_accounts', 'client_memberships', 'sync_runs', 'logixtic_tenant_discovery')
ORDER BY tabla, concedido_a, a.privilege_type;

-- 9. Recuentos exactos (solo números). Esperado: todos 0, salvo el catálogo que debe ser 9.
SELECT 'logixtic_tenant_discovery' AS tabla, count(*) AS filas FROM public.logixtic_tenant_discovery
UNION ALL SELECT 'verificados (debe ser 0)', count(*) FROM public.logixtic_tenant_discovery WHERE verification_status = 'verified'
UNION ALL SELECT 'con identificador oficial (debe ser 0)', count(*) FROM public.logixtic_tenant_discovery WHERE external_tenant_id IS NOT NULL
UNION ALL SELECT 'client_accounts', count(*) FROM public.client_accounts
UNION ALL SELECT 'client_memberships', count(*) FROM public.client_memberships
UNION ALL SELECT 'client_documents', count(*) FROM public.client_documents
UNION ALL SELECT 'client_documents sin operación', count(*) FROM public.client_documents WHERE operation_id IS NULL
UNION ALL SELECT 'client_document_events', count(*) FROM public.client_document_events
UNION ALL SELECT 'storage_cleanup_jobs', count(*) FROM public.storage_cleanup_jobs
UNION ALL SELECT 'sync_runs', count(*) FROM public.sync_runs
UNION ALL SELECT 'operation_refs', count(*) FROM public.operation_refs
UNION ALL SELECT 'tenants', count(*) FROM public.tenants
UNION ALL SELECT 'profiles', count(*) FROM public.profiles;

-- 10. Roles del portal (atributos; sin contraseñas).
SELECT rolname, rolcanlogin, rolbypassrls, rolcreaterole, rolcreatedb, rolsuper
FROM pg_roles
WHERE rolname IN ('portal_app', 'portal_api', 'anon', 'authenticated');

-- 11. Pertenencia a portal_app.
SELECT m.rolname AS miembro, r.rolname AS rol
FROM pg_auth_members am
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles r ON r.oid = am.roleid
WHERE r.rolname = 'portal_app';

-- 12. Objetos del esquema public que no pertenecen a la lista esperada (detecta cambios manuales no versionados).
SELECT c.relname AS tabla, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname NOT IN ('tenants', 'profiles', 'tenant_memberships', 'operation_refs', 'operation_events',
                        'event_comments', 'requests', 'attachments', 'client_accounts', 'client_memberships',
                        'client_documents', 'client_document_events', 'storage_cleanup_jobs', 'sync_runs',
                        'logixtic_tenant_discovery')
ORDER BY tabla;
