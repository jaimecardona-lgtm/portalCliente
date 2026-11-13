-- Campos de presentación de operaciones para la torre de control (aditiva).
--
-- Todas las columnas admiten NULL y no tienen valor por defecto: NULL significa "sin información".
-- Nada se rellena con valores inventados. Las políticas RLS y las claves compuestas de operation_refs
-- no cambian: las filas siguen filtradas por cliente final y por tenant.
-- Las migraciones anteriores no se modifican.

ALTER TABLE operation_refs
  ADD COLUMN origin_name text CHECK (origin_name IS NULL OR char_length(origin_name) BETWEEN 1 AND 200),
  ADD COLUMN destination_name text CHECK (destination_name IS NULL OR char_length(destination_name) BETWEEN 1 AND 200),
  ADD COLUMN transport_type text CHECK (
    transport_type IS NULL OR transport_type IN ('Marítimo FCL', 'Marítimo LCL', 'Aéreo', 'Terrestre')),
  ADD COLUMN etd date,
  ADD COLUMN eta date,
  ADD COLUMN booking_number text CHECK (booking_number IS NULL OR char_length(booking_number) BETWEEN 1 AND 100),
  ADD COLUMN carrier_name text CHECK (carrier_name IS NULL OR char_length(carrier_name) BETWEEN 1 AND 200),
  ADD COLUMN responsible_name text CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 200),
  -- NULL = no se sabe si requiere respuesta. TRUE/FALSE solo lo fija la sincronización o el procedimiento.
  ADD COLUMN pending_client_response boolean;

COMMENT ON COLUMN operation_refs.pending_client_response IS
  'NULL = sin información. TRUE = requiere respuesta del cliente. No se deriva del estado de la operación.';
