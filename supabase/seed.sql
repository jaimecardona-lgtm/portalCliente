-- seed.sql — datos EXCLUSIVAMENTE sintéticos para bases de desarrollo desechables.
--
-- POLÍTICA DE DATOS REALES: este archivo NUNCA se ejecuta en presentación, staging ni producción.
-- Solo en bases desechables y aisladas para pruebas automatizadas.
--
-- Qué crea: dos empresas ficticias, una operación y un evento por empresa.
-- Qué NO crea: perfiles, membresías ni usuarios. Un perfil exige un usuario real en Supabase Auth
-- (profiles.id referencia auth.users). Para asignar acceso usa apps/api/scripts/provision_dev.py
-- después de crear el usuario en Auth.
--
-- Datos: dominios .test, nombres de empresa ficticios, NIT de ejemplo. Sin datos de clientes reales.
-- Idempotente: ON CONFLICT DO NOTHING en todas las inserciones.

INSERT INTO tenants (id, slug, legal_name, tax_id, country, city)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'tn-andino', 'Textiles Andinos S.A.S. (sintética)', '900000001-1', 'CO', 'Medellín'),
  ('a0000000-0000-4000-8000-000000000002', 'tn-pacifico', 'Agroexport Pacífico Ltda. (sintética)', '900000002-2', 'CO', 'Cali')
ON CONFLICT (id) DO NOTHING;

INSERT INTO operation_refs (id, tenant_id, external_id, do_number, reference, last_known_status)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'SYN-A-1', 'DO-SYN-A-1001', 'Pedido sintético A', 'En tránsito'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'SYN-B-1', 'DO-SYN-B-2001', 'Pedido sintético B', 'Creado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO operation_events (id, tenant_id, operation_id, external_event_id, event_type, occurred_at, title, to_status, visibility)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'SYN-A-EV-1', 'status_change', '2026-11-10T14:00:00Z',
   'Salida de origen (sintética)', 'En tránsito', 'client'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002', 'SYN-B-EV-1', 'news', '2026-11-10T15:00:00Z',
   'Recepción programada (sintética)', NULL, 'client')
ON CONFLICT (id) DO NOTHING;
