-- 20261117000100_staff_qa_documents_quotes
-- Lectura administrativa de documentos ya existentes y cotizaciones QA separadas de las oficiales.
--
-- No reescribe migraciones aplicadas. Las políticas de membresía de cliente permanecen.
-- La escritura nueva solo admite empresas QA_SYNTHETIC_ONLY, personal platform_admin y la bandera de QA.
-- Las cotizaciones oficiales (source = logixtic_official) no pueden insertarse con portal_app.
-- Los montos son numeric, no flotantes. Ninguna URL firmada se guarda.

ALTER TABLE staff_role_permissions DROP CONSTRAINT IF EXISTS staff_role_permissions_permission_check;
ALTER TABLE staff_role_permissions ADD CONSTRAINT staff_role_permissions_permission_check CHECK (permission IN (
  'tenants.read', 'operations.read', 'documents.read', 'tenant_grants.manage',
  'tenants.work_pending', 'records.write', 'requests.create_qa',
  'quotes.read', 'documents.write_qa', 'quotes.write_qa'));

INSERT INTO staff_role_permissions (staff_role, permission)
VALUES
  ('platform_admin', 'quotes.read'),
  ('qa', 'quotes.read'),
  ('platform_admin', 'documents.write_qa'),
  ('platform_admin', 'quotes.write_qa')
ON CONFLICT DO NOTHING;

ALTER TABLE staff_access_audit DROP CONSTRAINT IF EXISTS staff_access_audit_action_check;
ALTER TABLE staff_access_audit ADD CONSTRAINT staff_access_audit_action_check CHECK (action IN (
  'context_select', 'context_exit', 'tenants_list', 'operations_list', 'context_denied',
  'record_create', 'account_read', 'documents_list', 'quotes_list'));

CREATE OR REPLACE FUNCTION portal_staff_can_write_qa(p_tenant_id uuid, p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT p_permission IN ('documents.write_qa', 'quotes.write_qa')
        AND EXISTS (
          SELECT 1
          FROM platform_staff s
          JOIN tenants t ON t.id = p_tenant_id
          WHERE s.user_id = portal_current_user_id()
            AND s.active
            AND s.staff_role = 'platform_admin'
            AND s.tenant_scope = 'qa_synthetic_only'
            AND portal_staff_has_permission(p_permission)
            AND portal_qa_synthetic_enabled()
            AND t.status = 'active'
            AND t.segment = 'QA_SYNTHETIC_ONLY'
            AND t.external_tenant_id IS NULL
            AND COALESCE(t.integration_status, '') <> 'verified'
            AND t.id IN (SELECT portal_staff_scope_tenant_ids())
        )
    $$;

GRANT EXECUTE ON FUNCTION portal_staff_can_write_qa(uuid, text) TO portal_app;

-- Documentos: el personal lee los de la empresa confirmada. No ve filas retiradas.
CREATE POLICY client_documents_staff_select ON client_documents FOR SELECT TO portal_app
    USING (
      tenant_id = portal_staff_selected_tenant()
      AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
      AND portal_staff_has_permission('documents.read')
      AND status = 'available'
    );

CREATE POLICY client_documents_staff_qa_insert ON client_documents FOR INSERT TO portal_app
    WITH CHECK (
      operation_id IS NULL
      AND status = 'available'
      AND uploaded_by = portal_current_user_id()
      AND portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
    );

CREATE POLICY client_document_events_staff_qa_insert ON client_document_events FOR INSERT TO portal_app
    WITH CHECK (
      actor_id = portal_current_user_id()
      AND action = 'uploaded'
      AND portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
    );

CREATE TABLE quotes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  number text NOT NULL CHECK (char_length(number) BETWEEN 3 AND 40),
  source text NOT NULL CHECK (source IN ('qa_synthetic', 'logixtic_official')),
  external_id text CHECK (external_id IS NULL OR char_length(external_id) BETWEEN 1 AND 80),
  issued_on date NOT NULL,
  valid_until date NOT NULL,
  service text NOT NULL CHECK (char_length(service) BETWEEN 3 AND 160),
  origin_place text NOT NULL CHECK (char_length(origin_place) BETWEEN 2 AND 120),
  destination_place text NOT NULL CHECK (char_length(destination_place) BETWEEN 2 AND 120),
  currency text NOT NULL CHECK (currency IN ('COP', 'USD', 'EUR')),
  status text NOT NULL CHECK (status IN ('pendiente', 'aceptada', 'rechazada', 'vencida')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  conditions text NOT NULL DEFAULT '' CHECK (char_length(conditions) <= 2000),
  observations text NOT NULL DEFAULT '' CHECK (char_length(observations) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX uq_quotes_source_external
    ON quotes (source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE quote_lines (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 1),
  concept text NOT NULL CHECK (char_length(concept) BETWEEN 2 AND 160),
  quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 40),
  unit_amount numeric(14, 2) NOT NULL CHECK (unit_amount >= 0),
  UNIQUE (quote_id, position),
  FOREIGN KEY (quote_id, tenant_id) REFERENCES quotes (id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE qa_seed_records (
  batch text NOT NULL CHECK (batch ~ '^qa-docs-quotes-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  entity text NOT NULL CHECK (entity IN ('client_account', 'client_document', 'quote')),
  entity_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  storage_path text CHECK (storage_path IS NULL OR char_length(storage_path) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch, entity, entity_id)
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_seed_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_staff_select ON quotes FOR SELECT TO portal_app
    USING (
      tenant_id = portal_staff_selected_tenant()
      AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
      AND portal_staff_has_permission('quotes.read')
    );

CREATE POLICY quotes_staff_qa_insert ON quotes FOR INSERT TO portal_app
    WITH CHECK (
      source = 'qa_synthetic'
      AND created_by = portal_current_user_id()
      AND portal_staff_can_write_qa(tenant_id, 'quotes.write_qa')
    );

CREATE POLICY quotes_staff_qa_delete ON quotes FOR DELETE TO portal_app
    USING (
      source = 'qa_synthetic'
      AND portal_staff_can_write_qa(tenant_id, 'quotes.write_qa')
      AND EXISTS (
        SELECT 1 FROM qa_seed_records r
        WHERE r.entity = 'quote' AND r.entity_id = quotes.id AND r.tenant_id = quotes.tenant_id
      )
    );

CREATE POLICY quote_lines_staff_select ON quote_lines FOR SELECT TO portal_app
    USING (
      tenant_id = portal_staff_selected_tenant()
      AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
      AND portal_staff_has_permission('quotes.read')
    );

CREATE POLICY quote_lines_staff_qa_insert ON quote_lines FOR INSERT TO portal_app
    WITH CHECK (
      tenant_id = portal_staff_selected_tenant()
      AND portal_staff_can_write_qa(tenant_id, 'quotes.write_qa')
      AND EXISTS (
        SELECT 1 FROM quotes q
        WHERE q.id = quote_id AND q.tenant_id = quote_lines.tenant_id AND q.source = 'qa_synthetic'
      )
    );

CREATE POLICY qa_seed_records_staff_select ON qa_seed_records FOR SELECT TO portal_app
    USING (
      tenant_id = portal_staff_selected_tenant()
      AND tenant_id IN (SELECT portal_staff_scope_tenant_ids())
      AND (
        portal_staff_has_permission('documents.read')
        OR portal_staff_has_permission('quotes.read')
      )
    );

CREATE POLICY qa_seed_records_staff_insert ON qa_seed_records FOR INSERT TO portal_app
    WITH CHECK (
      tenant_id = portal_staff_selected_tenant()
      AND (
        portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
        OR portal_staff_can_write_qa(tenant_id, 'quotes.write_qa')
      )
    );

CREATE POLICY qa_seed_records_staff_delete ON qa_seed_records FOR DELETE TO portal_app
    USING (
      portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
      OR portal_staff_can_write_qa(tenant_id, 'quotes.write_qa')
    );

CREATE POLICY client_documents_staff_qa_delete ON client_documents FOR DELETE TO portal_app
    USING (
      operation_id IS NULL
      AND portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
      AND EXISTS (
        SELECT 1 FROM qa_seed_records r
        WHERE r.entity = 'client_document'
          AND r.entity_id = client_documents.id
          AND r.tenant_id = client_documents.tenant_id
      )
    );

CREATE POLICY client_accounts_staff_qa_delete ON client_accounts FOR DELETE TO portal_app
    USING (
      origin = 'portal_manual'
      AND portal_staff_can_write_qa(tenant_id, 'documents.write_qa')
      AND EXISTS (
        SELECT 1 FROM qa_seed_records r
        WHERE r.entity = 'client_account'
          AND r.entity_id = client_accounts.id
          AND r.tenant_id = client_accounts.tenant_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM client_documents d WHERE d.client_account_id = client_accounts.id
      )
    );

GRANT SELECT, INSERT, DELETE ON quotes, quote_lines, qa_seed_records TO portal_app;
GRANT DELETE ON client_documents, client_accounts TO portal_app;

DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON quotes, quote_lines, qa_seed_records FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON quotes, quote_lines, qa_seed_records FROM authenticated;
      END IF;
    END
$$;

REVOKE ALL ON quotes, quote_lines, qa_seed_records FROM PUBLIC;
