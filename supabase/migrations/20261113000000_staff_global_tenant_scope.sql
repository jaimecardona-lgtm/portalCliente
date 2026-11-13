-- Alcance global verificado para personal interno (p. ej. QA con soporte autorizado).
--
-- Aditiva: no modifica migraciones anteriores ni datos existentes.
-- - platform_staff.tenant_scope: 'assigned' (por defecto, solo staff_tenant_grants) o
--   'all_verified_support_tenants' (cualquier tenant activo y verificado). Lo asigna y revoca un administrador
--   autorizado mediante el procedimiento controlado; nunca se deriva del correo ni del JWT.
-- - portal_staff_scope_tenant_ids() une ambas fuentes. RLS de tenants, operation_refs y client_accounts ya usa esa
--   función, así que el alcance se aplica igual en base de datos y en FastAPI.
-- - staff_access_audit.previous_tenant_id: registra el tenant anterior en cada cambio de contexto.

ALTER TABLE platform_staff
  ADD COLUMN tenant_scope text NOT NULL DEFAULT 'assigned'
    CHECK (tenant_scope IN ('assigned', 'all_verified_support_tenants')),
  ADD COLUMN scope_authorized_by text
    CHECK (scope_authorized_by IS NULL OR char_length(scope_authorized_by) BETWEEN 3 AND 200),
  ADD COLUMN scope_granted_at timestamptz,
  ADD CONSTRAINT platform_staff_scope_authorized CHECK (
    tenant_scope = 'assigned' OR (scope_authorized_by IS NOT NULL AND scope_granted_at IS NOT NULL)
  );

ALTER TABLE staff_access_audit
  ADD COLUMN previous_tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION portal_staff_scope_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      -- Alcance global: cualquier tenant verificado y activo, solo si el registro de personal lo concede.
      SELECT t.id
      FROM tenants t
      JOIN platform_staff s ON s.user_id = portal_current_user_id()
      WHERE s.active AND s.tenant_scope = 'all_verified_support_tenants'
        AND s.staff_role IS NOT NULL
        AND t.verified_at IS NOT NULL AND t.status = 'active'
      UNION
      -- Alcance restringido: asignaciones explícitas por tenant.
      SELECT g.tenant_id
      FROM staff_tenant_grants g
      JOIN platform_staff s ON s.user_id = g.user_id
      JOIN tenants t ON t.id = g.tenant_id
      WHERE g.user_id = portal_current_user_id()
        AND g.active AND s.active
        AND t.verified_at IS NOT NULL AND t.status = 'active'
        AND s.staff_role IS NOT NULL
    $$;

-- Último tenant de trabajo que la persona eligió (o null si salió del contexto). Lo calcula el servidor a partir
-- del historial de auditoría: nunca lo envía el cliente. La auditoría no es legible para el portal.
CREATE OR REPLACE FUNCTION portal_staff_previous_context_tenant() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT a.tenant_id
      FROM staff_access_audit a
      WHERE a.actor_id = portal_current_user_id()
        AND a.action IN ('context_select', 'context_exit') AND a.result = 'allowed'
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1
    $$;

REVOKE ALL ON FUNCTION portal_staff_previous_context_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_staff_previous_context_tenant() TO portal_app;
