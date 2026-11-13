-- Catálogo de empresas observadas en Logixtic para personal interno (aditiva).
-- No modifica las filas de logixtic_tenant_discovery ni su verificación: solo añade el código observado (slug)
-- y una función de lectura. La función NO expone el identificador externo, solo si existe.
ALTER TABLE logixtic_tenant_discovery
  ADD COLUMN IF NOT EXISTS observed_slug text
    CHECK (observed_slug IS NULL OR observed_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$');

CREATE OR REPLACE FUNCTION portal_observed_tenants()
RETURNS TABLE (observed_label text, observed_slug text, source_system text, verification_status text,
               has_official_id boolean, verified_at timestamptz, integration_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.observed_label, d.observed_slug, d.source_system, d.verification_status,
         d.external_tenant_id IS NOT NULL AS has_official_id, d.verified_at,
         CASE WHEN d.verified_at IS NOT NULL AND d.external_tenant_id IS NOT NULL
              THEN 'verificada' ELSE 'no_vinculada' END AS integration_status
  FROM logixtic_tenant_discovery d
  WHERE portal_current_staff_role() IS NOT NULL
    AND portal_staff_has_permission('tenants.read')
  ORDER BY d.observed_label
$$;

REVOKE ALL ON FUNCTION portal_observed_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_observed_tenants() TO portal_app;
