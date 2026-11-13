-- =====================================================================================================
-- PORTAL CLIENTE LOGIXTIC · DATOS DE DEMOSTRACIÓN (SINTÉTICOS) · PARTE 1: SIN USUARIOS
-- =====================================================================================================
-- Qué crea (solo filas marcadas como demostración):
--   * 2 empresas de demostración: DEMO-A-0001 y DEMO-B-0001 (identificadores inequívocamente sintéticos).
--   * 2 cuentas de cliente final por empresa (client_accounts).
--   * 3 operaciones por empresa, con estados distintos y datos distintos (operation_refs).
--   * 2 eventos de trazabilidad por operación (operation_events).
-- Qué NO crea (requiere cuentas reales de Supabase Auth; ver docs/sql/portal_demo_seed_users.sql):
--   * Membresías de usuario, solicitudes, documentos y metadatos documentales (todos referencian profiles).
--   * Cotizaciones: el esquema actual no tiene tabla de cotizaciones; no se crean.
--   * Archivos en Storage: se suben con el procedimiento de Storage; este script solo escribe metadatos.
-- Reglas:
--   * No usa los nombres observados en logixtic_tenant_discovery ni inventa identificadores oficiales.
--   * IDs deterministas (md5 del nombre del registro): el script es idempotente (ON CONFLICT DO UPDATE).
--   * Una sola transacción. Si una comprobación falla, PostgreSQL revierte todo.
--   * Para ejecutar en SQL Editor de un proyecto de DESARROLLO aislado. No ejecutar en producción.
-- Reversión: docs/sql/portal_demo_rollback.sql
-- =====================================================================================================

BEGIN;

-- 0. Guardas: el script solo escribe filas de demostración.
DO $$
DECLARE
  demo_a uuid := md5('demo-tenant:DEMO-A-0001')::uuid;
  demo_b uuid := md5('demo-tenant:DEMO-B-0001')::uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE external_tenant_id IN ('DEMO-A-0001', 'DEMO-B-0001') AND id NOT IN (demo_a, demo_b)
  ) THEN
    RAISE EXCEPTION 'Abortado: ya existe otra empresa con un identificador DEMO-. Revise antes de continuar.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE slug IN ('demo-a-0001', 'demo-b-0001') AND id NOT IN (demo_a, demo_b)) THEN
    RAISE EXCEPTION 'Abortado: el slug de demostración ya pertenece a otra empresa.';
  END IF;
END $$;

-- 1. Empresas de demostración. Verificadas con identificadores DEMO-* (sintéticos, NO oficiales).
INSERT INTO tenants (id, slug, legal_name, tax_id, country, city, segment, account_manager, status,
                     external_tenant_id, verified_at)
VALUES
  (md5('demo-tenant:DEMO-A-0001')::uuid, 'demo-a-0001',
   'DEMO-A-0001 · Empresa sintética A (no real)', 'DEMO-TAX-A-0001', 'Demostración', 'Demostración',
   'Demostración', 'Equipo de demostración', 'active', 'DEMO-A-0001', now()),
  (md5('demo-tenant:DEMO-B-0001')::uuid, 'demo-b-0001',
   'DEMO-B-0001 · Empresa sintética B (no real)', 'DEMO-TAX-B-0001', 'Demostración', 'Demostración',
   'Demostración', 'Equipo de demostración', 'active', 'DEMO-B-0001', now())
ON CONFLICT (id) DO UPDATE SET
  legal_name = EXCLUDED.legal_name, status = 'active', external_tenant_id = EXCLUDED.external_tenant_id,
  verified_at = COALESCE(tenants.verified_at, EXCLUDED.verified_at), updated_at = now();

-- 2. Cuentas de cliente final: dos por empresa.
INSERT INTO client_accounts (id, tenant_id, legal_name, tax_id, external_client_id, status)
VALUES
  (md5('demo-client:A1')::uuid, md5('demo-tenant:DEMO-A-0001')::uuid,
   'DEMO Cliente A1 (sintético)', 'DEMO-CLI-A1', 'DEMO-A-CLI-001', 'active'),
  (md5('demo-client:A2')::uuid, md5('demo-tenant:DEMO-A-0001')::uuid,
   'DEMO Cliente A2 (sintético)', 'DEMO-CLI-A2', 'DEMO-A-CLI-002', 'active'),
  (md5('demo-client:B1')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid,
   'DEMO Cliente B1 (sintético)', 'DEMO-CLI-B1', 'DEMO-B-CLI-001', 'active'),
  (md5('demo-client:B2')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid,
   'DEMO Cliente B2 (sintético)', 'DEMO-CLI-B2', 'DEMO-B-CLI-002', 'active')
ON CONFLICT (id) DO UPDATE SET
  legal_name = EXCLUDED.legal_name, status = 'active', updated_at = now();

-- 3. Operaciones: tres por empresa, con estados y datos distintos.
INSERT INTO operation_refs (id, tenant_id, external_system, external_id, do_number, reference,
                            last_known_status, last_synced_at, client_account_id, source_version)
VALUES
  (md5('demo-op:A-1')::uuid, md5('demo-tenant:DEMO-A-0001')::uuid, 'logixtic', 'DEMO-A-OP-001',
   'DO-DEMO-A-001', 'Pedido sintético A-1 · insumos', 'En tránsito', now(),
   md5('demo-client:A1')::uuid, 'demo-1'),
  (md5('demo-op:A-2')::uuid, md5('demo-tenant:DEMO-A-0001')::uuid, 'logixtic', 'DEMO-A-OP-002',
   'DO-DEMO-A-002', 'Pedido sintético A-2 · maquinaria', 'En aduana', now(),
   md5('demo-client:A1')::uuid, 'demo-1'),
  (md5('demo-op:A-3')::uuid, md5('demo-tenant:DEMO-A-0001')::uuid, 'logixtic', 'DEMO-A-OP-003',
   'DO-DEMO-A-003', 'Pedido sintético A-3 · muestras', 'Entregado', now(),
   md5('demo-client:A2')::uuid, 'demo-1'),
  (md5('demo-op:B-1')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid, 'logixtic', 'DEMO-B-OP-001',
   'DO-DEMO-B-001', 'Pedido sintético B-1 · repuestos', 'Creado', now(),
   md5('demo-client:B1')::uuid, 'demo-1'),
  (md5('demo-op:B-2')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid, 'logixtic', 'DEMO-B-OP-002',
   'DO-DEMO-B-002', 'Pedido sintético B-2 · alimentos', 'En puerto', now(),
   md5('demo-client:B1')::uuid, 'demo-1'),
  (md5('demo-op:B-3')::uuid, md5('demo-tenant:DEMO-B-0001')::uuid, 'logixtic', 'DEMO-B-OP-003',
   'DO-DEMO-B-003', 'Pedido sintético B-3 · textiles', 'Entregado', now(),
   md5('demo-client:B2')::uuid, 'demo-1')
ON CONFLICT (id) DO UPDATE SET
  reference = EXCLUDED.reference, last_known_status = EXCLUDED.last_known_status,
  last_synced_at = EXCLUDED.last_synced_at, client_account_id = EXCLUDED.client_account_id;

-- 4. Eventos de trazabilidad: dos por operación (cambio de estado, visible para el cliente).
INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type, occurred_at,
                              title, description, author_name, from_status, to_status, visibility)
SELECT
  md5('demo-event:' || o.key || ':' || e.n)::uuid,
  o.tenant_id, o.id,
  'DEMO-' || o.key || '-E' || e.n,
  'status_change',
  now() - make_interval(days => 10 - e.n * 3),
  CASE WHEN e.n = 1 THEN 'Operación registrada (demo)' ELSE 'Cambio de estado (demo)' END,
  'Evento sintético de demostración. No corresponde a un movimiento real.',
  'Equipo de demostración',
  CASE WHEN e.n = 1 THEN NULL ELSE 'Creado' END,
  o.status_now,
  'client'
FROM (VALUES
  ('A-1', md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-op:A-1')::uuid, 'En tránsito'),
  ('A-2', md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-op:A-2')::uuid, 'En aduana'),
  ('A-3', md5('demo-tenant:DEMO-A-0001')::uuid, md5('demo-op:A-3')::uuid, 'Entregado'),
  ('B-1', md5('demo-tenant:DEMO-B-0001')::uuid, md5('demo-op:B-1')::uuid, 'Creado'),
  ('B-2', md5('demo-tenant:DEMO-B-0001')::uuid, md5('demo-op:B-2')::uuid, 'En puerto'),
  ('B-3', md5('demo-tenant:DEMO-B-0001')::uuid, md5('demo-op:B-3')::uuid, 'Entregado')
) AS o(key, tenant_id, id, status_now)
CROSS JOIN (VALUES (1), (2)) AS e(n)
ON CONFLICT (tenant_id, external_event_id) DO UPDATE SET
  title = EXCLUDED.title, to_status = EXCLUDED.to_status, occurred_at = EXCLUDED.occurred_at;

-- 5. Comprobaciones: si algo no cuadra, la transacción se revierte.
DO $$
DECLARE
  n_tenants int; n_clients int; n_ops int; n_events int;
BEGIN
  SELECT count(*) INTO n_tenants FROM tenants WHERE external_tenant_id IN ('DEMO-A-0001', 'DEMO-B-0001');
  SELECT count(*) INTO n_clients FROM client_accounts WHERE external_client_id LIKE 'DEMO-%';
  SELECT count(*) INTO n_ops FROM operation_refs WHERE do_number LIKE 'DO-DEMO-%';
  SELECT count(*) INTO n_events FROM operation_events WHERE external_event_id LIKE 'DEMO-%';
  IF n_tenants <> 2 OR n_clients <> 4 OR n_ops <> 6 OR n_events <> 12 THEN
    RAISE EXCEPTION 'Recuentos inesperados: empresas %, clientes %, operaciones %, eventos %',
      n_tenants, n_clients, n_ops, n_events;
  END IF;
END $$;

COMMIT;

-- 6. Recuentos esperados por empresa (solo lectura, para revisar tras ejecutar):
--   DEMO-A-0001: 2 clientes, 3 operaciones (En tránsito, En aduana, Entregado), 6 eventos.
--   DEMO-B-0001: 2 clientes, 3 operaciones (Creado, En puerto, Entregado), 6 eventos.
SELECT t.external_tenant_id AS empresa,
       (SELECT count(*) FROM client_accounts c WHERE c.tenant_id = t.id AND c.external_client_id LIKE 'DEMO-%') AS clientes,
       (SELECT count(*) FROM operation_refs o WHERE o.tenant_id = t.id AND o.do_number LIKE 'DO-DEMO-%') AS operaciones,
       (SELECT count(*) FROM operation_events e WHERE e.tenant_id = t.id AND e.external_event_id LIKE 'DEMO-%') AS eventos
FROM tenants t
WHERE t.external_tenant_id IN ('DEMO-A-0001', 'DEMO-B-0001')
ORDER BY t.external_tenant_id;
