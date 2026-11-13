-- Lectura de trazabilidad para personal interno (aditiva).
-- El personal lee los eventos VISIBLES PARA EL CLIENTE de la empresa de trabajo seleccionada, con el mismo
-- filtro que las operaciones: tenant seleccionado + alcance verificado + permiso operations.read.
-- Los eventos internos (visibility distinta de 'client') no se conceden por esta vía.
-- No modifica migraciones anteriores ni políticas de cliente final.
CREATE POLICY operation_events_staff_select ON operation_events FOR SELECT TO portal_app
      USING (
        tenant_id = portal_staff_selected_tenant()
        AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
        AND portal_staff_has_permission('operations.read')
        AND visibility = 'client'
      );
