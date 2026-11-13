-- AUDITORÍA DE SOLO LECTURA · empresas, operaciones, eventos y documentos (Portal Cliente Logixtic).
-- Ejecutar en Supabase SQL Editor con la cuenta de propietario. Sin escrituras: la transacción termina en ROLLBACK.
-- Pegar el resultado completo. Los identificadores externos se muestran tal cual; no se inventan relaciones.

BEGIN READ ONLY;

-- 1. Recuentos reales por tabla.
SELECT 'logixtic_tenant_discovery' AS tabla, count(*) AS filas FROM public.logixtic_tenant_discovery
UNION ALL SELECT 'tenants', count(*) FROM public.tenants
UNION ALL SELECT 'client_accounts', count(*) FROM public.client_accounts
UNION ALL SELECT 'operation_refs', count(*) FROM public.operation_refs
UNION ALL SELECT 'operation_events', count(*) FROM public.operation_events
UNION ALL SELECT 'client_documents', count(*) FROM public.client_documents
UNION ALL SELECT 'sync_runs', count(*) FROM public.sync_runs
UNION ALL SELECT 'platform_staff', count(*) FROM public.platform_staff;

-- 2. Catálogo observado: nombre, código y estado. Sin inferir vínculos por nombre.
SELECT observed_label, observed_slug, source_system, verification_status,
       external_tenant_id IS NOT NULL AS tiene_id_oficial, verified_at
FROM public.logixtic_tenant_discovery
ORDER BY observed_label;

-- 3. Empresas operativas (tenants) y su verificación.
SELECT id, slug, legal_name, external_tenant_id, verified_at, status
FROM public.tenants
ORDER BY legal_name;

-- 4. Relación por identificador: ¿alguna empresa operativa coincide con un identificador oficial del catálogo?
SELECT t.slug, t.external_tenant_id, d.observed_label
FROM public.tenants t
JOIN public.logixtic_tenant_discovery d ON d.external_tenant_id = t.external_tenant_id;

-- 5. Clientes finales por empresa.
SELECT t.slug, c.id AS cliente_id, c.external_client_id, c.status,
       (SELECT count(*) FROM public.client_memberships m WHERE m.client_account_id = c.id) AS membresias
FROM public.client_accounts c
JOIN public.tenants t ON t.id = c.tenant_id
ORDER BY t.slug, c.external_client_id;

-- 6. Operaciones por empresa: cuántas, con cliente asignado, estados y procedencia.
SELECT t.slug, o.external_system, count(*) AS operaciones,
       count(o.client_account_id) AS con_cliente,
       count(o.last_known_status) AS con_estado,
       count(o.eta) AS con_eta,
       min(o.last_synced_at) AS primera_sync, max(o.last_synced_at) AS ultima_sync
FROM public.operation_refs o
JOIN public.tenants t ON t.id = o.tenant_id
GROUP BY t.slug, o.external_system
ORDER BY t.slug;

-- 7. Eventos por empresa y visibilidad.
SELECT t.slug, e.visibility, count(*) AS eventos
FROM public.operation_events e
JOIN public.tenants t ON t.id = e.tenant_id
GROUP BY t.slug, e.visibility
ORDER BY t.slug, e.visibility;

-- 8. Documentos por empresa y estado (solo metadatos; no se leen archivos).
SELECT t.slug, d.status, count(*) AS documentos,
       count(d.storage_path) AS con_ruta_storage
FROM public.client_documents d
JOIN public.tenants t ON t.id = d.tenant_id
GROUP BY t.slug, d.status
ORDER BY t.slug;

-- 9. Historial de migraciones aplicadas en este proyecto.
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

ROLLBACK;
