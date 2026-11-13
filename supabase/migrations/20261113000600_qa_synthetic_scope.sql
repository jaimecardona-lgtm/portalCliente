-- 20261113000600_qa_synthetic_scope
-- Alcance QA interno sobre empresas sintéticas (segment = 'QA_SYNTHETIC_ONLY'), aditivo.
--
-- - Bandera de entorno en base de datos, DESACTIVADA por defecto. Solo la cambia el propietario del esquema
--   mediante el procedimiento controlado. Sin ella no se ve ninguna empresa QA, aunque haya asignación.
-- - Alcance 'qa_synthetic_only' en platform_staff: no deriva del correo, del JWT ni de user_metadata.
-- - Solo empresas con segment 'QA_SYNTHETIC_ONLY' y activas. NO concede verified_at ni external_tenant_id.
-- - Solo roles qa y platform_admin (validado aquí y en el procedimiento del propietario).
-- - RLS de tenants, operation_refs, operation_events y requests se mantiene: la pertenencia al alcance se
--   vuelve a comprobar en cada consulta. No se usan roles elevados ni se desactiva RLS.
-- - Usuarios externos: esta función solo lista personal activo; un cliente nunca obtiene este alcance.

-- ---------------------------------------------------------------------------
-- 1. Bandera de entorno (solo propietario escribe; ningún rol del portal la modifica)
-- ---------------------------------------------------------------------------
CREATE TABLE portal_environment_flags (
  flag text PRIMARY KEY CHECK (flag IN ('qa_synthetic_enabled')),
  enabled boolean NOT NULL DEFAULT false,
  authorized_by text CHECK (authorized_by IS NULL OR char_length(authorized_by) BETWEEN 3 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO portal_environment_flags (flag, enabled) VALUES ('qa_synthetic_enabled', false)
ON CONFLICT (flag) DO NOTHING;

ALTER TABLE portal_environment_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_environment_flags FROM PUBLIC;

CREATE OR REPLACE FUNCTION portal_qa_synthetic_enabled() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT coalesce(
        (SELECT f.enabled FROM portal_environment_flags f WHERE f.flag = 'qa_synthetic_enabled'), false)
    $$;

REVOKE ALL ON FUNCTION portal_qa_synthetic_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_qa_synthetic_enabled() TO portal_app;

-- ---------------------------------------------------------------------------
-- 2. Nuevo alcance de personal
-- ---------------------------------------------------------------------------
ALTER TABLE platform_staff DROP CONSTRAINT IF EXISTS platform_staff_tenant_scope_check;
ALTER TABLE platform_staff ADD CONSTRAINT platform_staff_tenant_scope_check CHECK (
  tenant_scope IN ('assigned', 'all_verified_support_tenants', 'qa_synthetic_only'));

ALTER TABLE platform_staff ADD CONSTRAINT platform_staff_qa_scope_role CHECK (
  tenant_scope <> 'qa_synthetic_only' OR staff_role IN ('qa', 'platform_admin'));

-- ---------------------------------------------------------------------------
-- 3. Alcance: añade las empresas QA solo con bandera activa y alcance explícito
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_staff_scope_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      -- Alcance global: solo empresas verificadas y activas.
      SELECT t.id
      FROM tenants t
      JOIN platform_staff s ON s.user_id = portal_current_user_id()
      WHERE s.active AND s.tenant_scope = 'all_verified_support_tenants'
        AND s.staff_role IS NOT NULL
        AND t.verified_at IS NOT NULL AND t.status = 'active'
      UNION
      -- Asignaciones explícitas: verificadas, o empresas dadas de alta (pendientes) con 'tenants.work_pending'.
      SELECT g.tenant_id
      FROM staff_tenant_grants g
      JOIN platform_staff s ON s.user_id = g.user_id
      JOIN tenants t ON t.id = g.tenant_id
      WHERE g.user_id = portal_current_user_id()
        AND g.active AND s.active
        AND t.status = 'active'
        AND s.staff_role IS NOT NULL
        AND (
          t.verified_at IS NOT NULL
          OR (t.discovery_observed_label IS NOT NULL AND portal_staff_has_permission('tenants.work_pending'))
        )
      UNION
      -- Entorno QA: solo con bandera activa, empresas sintéticas activas y alcance qa_synthetic_only.
      SELECT t.id
      FROM tenants t
      JOIN platform_staff s ON s.user_id = portal_current_user_id()
      WHERE s.active AND s.tenant_scope = 'qa_synthetic_only'
        AND s.staff_role IN ('qa', 'platform_admin')
        AND t.segment = 'QA_SYNTHETIC_ONLY' AND t.status = 'active'
        AND portal_qa_synthetic_enabled()
    $$;
