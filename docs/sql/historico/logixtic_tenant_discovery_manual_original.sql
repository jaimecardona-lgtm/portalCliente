-- REFERENCIA HISTÓRICA. NO es una migración: no se ejecuta con supabase db push.
-- SQL ejecutado manualmente en Supabase SQL Editor antes de la fase 12C.2. Se conserva para comparar la
-- estructura con la migración 20261112000100_tenant_discovery_reconcile.sql.
-- Nombres observados en una captura del selector de Logixtic: no son códigos oficiales ni conceden permisos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.logixtic_tenant_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'logixtic'
    CHECK (source_system = 'logixtic'),
  observed_label text NOT NULL
    CHECK (length(trim(observed_label)) BETWEEN 2 AND 200),
  external_tenant_id text,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (
      verification_status IN (
        'unverified', 'verified', 'rejected'
      )
    ),
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (source_system, observed_label),
  CONSTRAINT verified_requires_id CHECK (
    verification_status <> 'verified'
    OR (
      nullif(trim(external_tenant_id), '') IS NOT NULL
      AND verified_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_logixtic_tenant_discovery_source_id
ON public.logixtic_tenant_discovery (
  source_system, external_tenant_id
)
WHERE external_tenant_id IS NOT NULL;

COMMENT ON TABLE public.logixtic_tenant_discovery IS
  'Manual observation queue only. Not an authorization source. Never expose to clients. Replace with verified immutable Logixtic IDs via an approved integration.';

ALTER TABLE public.logixtic_tenant_discovery
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.logixtic_tenant_discovery
FROM PUBLIC, anon, authenticated, portal_app;

INSERT INTO public.logixtic_tenant_discovery (observed_label)
VALUES
  ('CLM CARGO'),
  ('Capacity Tenant 01'),
  ('Capacity Tenant 02'),
  ('Capacity Tenant 03'),
  ('Demo Logixtic'),
  ('D' || chr(180) || 'MAG LOGISTIC SAS'),
  ('Global Trade Business'),
  ('ITALIAN SHIPPING'),
  ('Line Cargo S.A.S')
ON CONFLICT (source_system, observed_label)
DO NOTHING;

COMMIT;
