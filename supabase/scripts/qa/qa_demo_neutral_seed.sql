-- SEMILLA QA NEUTRA · SOLO BASES LOCALES DESECHABLES.
-- Nueve empresas de ejemplo (nombres neutros, sin relación con empresas reales), 20 operaciones y 100 eventos
-- por empresa. Idempotente: se puede volver a ejecutar sin duplicar filas.
-- No es para Supabase remoto ni para Render. La guarda de abajo lo impide si la conexión no es local.
-- Todo está etiquetado con segment = 'QA_SYNTHETIC_ONLY' y is_demo = true.
-- No registra fechas de sincronización: nada aquí se presenta como sincronizado desde Logixtic.

DO $guarda$
    BEGIN
      IF inet_server_addr() IS NOT NULL
         AND NOT (inet_server_addr() <<= '127.0.0.0/8'::inet OR inet_server_addr() = '::1'::inet) THEN
        RAISE EXCEPTION 'Semilla QA neutra: solo para bases locales desechables. Conexión no local rechazada.';
      END IF;
    END
    $guarda$;

BEGIN;

INSERT INTO tenants (slug, legal_name, tax_id, status, is_demo, segment)
SELECT 'qa-ejemplo-' || lpad(n::text, 2, '0'),
       'Empresa de ejemplo ' || lpad(n::text, 2, '0'),
       'EJ-' || lpad(n::text, 6, '0'),
       'active', true, 'QA_SYNTHETIC_ONLY'
FROM generate_series(1, 9) AS n
ON CONFLICT (slug) DO NOTHING;

INSERT INTO operation_refs (
  tenant_id, external_system, external_id, do_number, reference, last_known_status, last_synced_at,
  origin_name, destination_name, transport_type, etd, eta, booking_number, carrier_name, responsible_name,
  pending_client_response)
SELECT t.id, 'logixtic',
       'EJ-' || right(t.slug, 2) || '-DO-' || lpad(k::text, 3, '0'),
       'DO-EJ' || right(t.slug, 2) || '-' || lpad(k::text, 3, '0'),
       'Referencia de ejemplo ' || k,
       (ARRAY['Recibida', 'En tránsito', 'En aduana', 'Entregada'])[1 + (k % 4)],
       NULL,
       'Origen de ejemplo ' || (k % 3 + 1),
       'Destino de ejemplo ' || (k % 2 + 1),
       (ARRAY['Marítimo FCL', 'Aéreo', 'Terrestre'])[1 + (k % 3)],
       current_date - (k % 30),
       current_date + (k % 40),
       'BK-EJ-' || lpad(k::text, 4, '0'),
       'Transportista de ejemplo ' || (k % 4 + 1),
       'Responsable de ejemplo ' || (k % 3 + 1),
       (k % 5 = 0)
FROM tenants t
CROSS JOIN generate_series(1, 20) AS k
WHERE t.segment = 'QA_SYNTHETIC_ONLY' AND t.slug LIKE 'qa-ejemplo-%'
ON CONFLICT (tenant_id, external_system, external_id) DO NOTHING;

INSERT INTO operation_events (
  tenant_id, operation_id, external_event_id, event_type, occurred_at, title, description,
  author_name, from_status, to_status, visibility)
SELECT o.tenant_id, o.id,
       o.external_id || '-EV-' || j,
       'status_change',
       now() - make_interval(days => j),
       'Evento de ejemplo ' || j,
       'Descripción de ejemplo, sin datos reales.',
       'Responsable de ejemplo',
       NULL,
       o.last_known_status,
       'client'
FROM operation_refs o
JOIN tenants t ON t.id = o.tenant_id
CROSS JOIN generate_series(1, 5) AS j
WHERE t.segment = 'QA_SYNTHETIC_ONLY' AND t.slug LIKE 'qa-ejemplo-%'
ON CONFLICT (tenant_id, external_event_id) DO NOTHING;

COMMIT;

-- Verificación: 9 empresas, 20 operaciones y 100 eventos por empresa.
SELECT t.slug,
       (SELECT count(*) FROM operation_refs o WHERE o.tenant_id = t.id) AS operaciones,
       (SELECT count(*) FROM operation_events e WHERE e.tenant_id = t.id) AS eventos
FROM tenants t
WHERE t.segment = 'QA_SYNTHETIC_ONLY'
ORDER BY t.slug;
