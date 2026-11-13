-- REVERSIÓN de 20261113000300_observed_tenants_read.
DROP FUNCTION IF EXISTS portal_observed_tenants();
ALTER TABLE logixtic_tenant_discovery DROP COLUMN IF EXISTS observed_slug;
