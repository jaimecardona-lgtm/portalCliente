-- FASE 12C.3 · VALIDACIÓN POSTERIOR A LA APLICACIÓN REMOTA (SOLO LECTURA)
-- Ejecutar en Supabase SQL Editor como propietario SOLO después de `supabase db push --linked` autorizado.
-- Solo SELECT. No muestra valores de datos: los recuentos y las comprobaciones devuelven números o booleanos.
-- Resultado esperado de cada bloque se indica en el comentario. Cualquier desviación detiene la validación.

-- 1. Versiones registradas: deben aparecer las cuatro, en orden.
--    Esperado: 20261111000000, 20261111000100, 20261112000000, 20261112000100.
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- 2. Existencia de las tablas nuevas y de la tabla de descubrimiento.
--    Esperado: todas true. RLS activa en todas.
SELECT t.name,
       to_regclass('public.' || t.name) IS NOT NULL AS existe,
       (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.' || t.name)) AS rls_activa
FROM (VALUES ('client_accounts'), ('client_memberships'), ('sync_runs'), ('logixtic_tenant_discovery')) AS t(name);

-- 3. Claves foráneas compuestas e integridad referencial.
--    Esperado: client_memberships tiene 3 foráneas (cuenta+tenant, usuario+tenant, tenant); operation_refs_client_fk existe.
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'f'
  AND (conrelid IN ('public.client_memberships'::regclass, 'public.client_accounts'::regclass)
       OR conname = 'operation_refs_client_fk')
ORDER BY tabla::text, conname;

-- 4. Integridad de datos: membresías de cliente sin membresía de tenant (debe ser 0).
SELECT count(*) AS membresias_cliente_huerfanas
FROM public.client_memberships m
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_memberships t
  WHERE t.user_id = m.user_id AND t.tenant_id = m.tenant_id
);

-- 5. Operaciones sin cliente asignado (informativo: en remoto no debería haber operaciones reales todavía).
SELECT count(*) AS operaciones_sin_cliente FROM public.operation_refs WHERE client_account_id IS NULL;

-- 6. Políticas RLS de las tablas afectadas.
--    Esperado: 14 políticas en total con estos nombres (ver docs/fase-12c3-aplicacion-remota.md).
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT count(*) AS politicas_totales FROM pg_policies WHERE schemaname = 'public';

-- 7. Catálogo de descubrimiento: nueve registros conservados, cero verificados y cero identificadores oficiales.
--    Esperado: nombres_observados = 9, verificados = 0, con_identificador_oficial = 0.
SELECT count(*) AS nombres_observados,
       count(*) FILTER (WHERE verification_status <> 'unverified') AS no_unverified,
       count(*) FILTER (WHERE verification_status = 'verified') AS verificados,
       count(*) FILTER (WHERE external_tenant_id IS NOT NULL) AS con_identificador_oficial
FROM public.logixtic_tenant_discovery;

-- 8. Restricciones de verificación: un registro 'verified' sin identificador o sin fecha no puede existir.
--    Esperado: 0 (la restricción verified_requires_id lo impide, esta consulta lo confirma).
SELECT count(*) AS verificados_incompletos
FROM public.logixtic_tenant_discovery
WHERE verification_status = 'verified'
  AND (nullif(trim(external_tenant_id), '') IS NULL OR verified_at IS NULL);

-- 9. Privilegios efectivos: el catálogo y sync_runs NO son legibles por los roles del portal ni por la API pública.
--    Esperado: todas las columnas false.
SELECT
  has_table_privilege('portal_app', 'public.logixtic_tenant_discovery', 'SELECT') AS catalogo_portal_app,
  has_table_privilege('portal_app', 'public.sync_runs', 'SELECT') AS sync_runs_portal_app,
  (SELECT count(*) > 0 FROM pg_roles WHERE rolname = 'anon')
    AND has_table_privilege('anon', 'public.logixtic_tenant_discovery', 'SELECT') AS catalogo_anon,
  (SELECT count(*) > 0 FROM pg_roles WHERE rolname = 'authenticated')
    AND has_table_privilege('authenticated', 'public.logixtic_tenant_discovery', 'SELECT') AS catalogo_authenticated;

-- 10. Privilegios de las tablas de cliente: solo lectura para portal_app; nada para anon ni authenticated.
--     Esperado: lectura portal_app = true en client_accounts y client_memberships; escritura portal_app = false.
SELECT t.name,
       has_table_privilege('portal_app', 'public.' || t.name, 'SELECT') AS portal_lectura,
       has_table_privilege('portal_app', 'public.' || t.name, 'INSERT,UPDATE,DELETE') AS portal_escritura
FROM (VALUES ('client_accounts'), ('client_memberships')) AS t(name);

-- 11. Roles: portal_app sin LOGIN ni BYPASSRLS; portal_api (cuando exista) sin BYPASSRLS, CREATEROLE ni superusuario.
SELECT rolname, rolcanlogin, rolbypassrls, rolcreaterole, rolcreatedb, rolsuper
FROM pg_roles
WHERE rolname IN ('portal_app', 'portal_api');
