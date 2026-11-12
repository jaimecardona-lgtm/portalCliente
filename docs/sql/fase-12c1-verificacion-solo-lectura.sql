-- FASE 12C.1 · Verificación de SOLO LECTURA del proyecto remoto.
-- Ejecutar como propietario en Supabase SQL Editor. No modifica nada: solo SELECT.
-- No muestra filas de la tabla de descubrimiento; solo estructura, recuentos y metadatos.
-- Pegue el resultado completo en la conversación. Si alguna consulta devuelve valores de datos
-- personales o empresariales, sustitúyalos por "[oculto]" antes de compartirlo.

-- 1. Existencia de las tablas relevantes
SELECT name, to_regclass('public.' || name) IS NOT NULL AS existe
FROM (VALUES
  ('logixtic_tenant_discovery'), ('tenants'), ('profiles'), ('tenant_memberships'),
  ('operation_refs'), ('operation_events'), ('event_comments'), ('requests'), ('attachments'),
  ('client_accounts'), ('client_memberships'), ('sync_runs')
) AS t(name);

-- 2. Columnas de la tabla de descubrimiento (tipos, nulidad y valor por defecto; sin datos)
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'logixtic_tenant_discovery'
ORDER BY ordinal_position;

-- 3. Restricciones (claves, únicas, de comprobación y foráneas) de la tabla de descubrimiento
SELECT conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.logixtic_tenant_discovery'::regclass
ORDER BY conname;

-- 4. Índices de la tabla de descubrimiento
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery'
ORDER BY indexname;

-- 5. RLS y políticas de la tabla de descubrimiento
SELECT c.relrowsecurity AS rls_activa, c.relforcerowsecurity AS rls_forzada
FROM pg_class c WHERE c.oid = 'public.logixtic_tenant_discovery'::regclass;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery';

-- 6. Privilegios concedidos sobre la tabla de descubrimiento (roles de API y del portal)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'logixtic_tenant_discovery'
ORDER BY grantee, privilege_type;

-- 7. Recuento exacto de la tabla de descubrimiento (solo el número)
SELECT count(*) AS filas_descubrimiento FROM public.logixtic_tenant_discovery;

-- 8. Recuentos de tablas operativas (deben ser 0 si no hay datos reales cargados)
SELECT 'tenants' AS tabla, count(*) AS filas FROM public.tenants
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'tenant_memberships', count(*) FROM public.tenant_memberships
UNION ALL SELECT 'operation_refs', count(*) FROM public.operation_refs
UNION ALL SELECT 'operation_events', count(*) FROM public.operation_events
UNION ALL SELECT 'event_comments', count(*) FROM public.event_comments
UNION ALL SELECT 'requests', count(*) FROM public.requests
UNION ALL SELECT 'attachments', count(*) FROM public.attachments;

-- 9. Historial de migraciones registrado por Supabase CLI
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 10. Roles del portal: sin LOGIN ni BYPASSRLS para portal_app; atributos de portal_api si existe
SELECT rolname, rolcanlogin, rolbypassrls, rolcreaterole, rolcreatedb, rolsuper
FROM pg_roles
WHERE rolname IN ('portal_app', 'portal_api', 'anon', 'authenticated');

-- 11. Pertenencia de portal_api a portal_app (si portal_api existe)
SELECT m.rolname AS miembro, r.rolname AS rol
FROM pg_auth_members am
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles r ON r.oid = am.roleid
WHERE r.rolname = 'portal_app';
