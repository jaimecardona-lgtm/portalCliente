-- REVERSIÓN de 20261113000200_staff_operation_events_read: retira la lectura de eventos para personal.
DROP POLICY IF EXISTS operation_events_staff_select ON operation_events;
