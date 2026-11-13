-- REVERSIÓN de 20261113000100_operation_display_fields. Borra los campos de presentación.
-- Antes, confirmar que no hay datos que conservar en esas columnas (si los hay, exportarlos primero).
ALTER TABLE operation_refs
  DROP COLUMN IF EXISTS pending_client_response,
  DROP COLUMN IF EXISTS responsible_name,
  DROP COLUMN IF EXISTS carrier_name,
  DROP COLUMN IF EXISTS booking_number,
  DROP COLUMN IF EXISTS eta,
  DROP COLUMN IF EXISTS etd,
  DROP COLUMN IF EXISTS transport_type,
  DROP COLUMN IF EXISTS destination_name,
  DROP COLUMN IF EXISTS origin_name;
