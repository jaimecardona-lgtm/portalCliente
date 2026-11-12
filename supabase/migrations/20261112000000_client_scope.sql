-- 20261112000000_client_scope
-- Fase 12B: nivel B de aislamiento (cliente final dentro de un tenant de Logixtic).
--
-- Principios:
-- - Solo AÑADE estructuras y SUSTITUYE las políticas RLS afectadas. No edita migraciones ya aplicadas.
-- - Un usuario ve una operación solo si pertenece al cliente final asignado a esa operación (además de
--   ser miembro activo del tenant). Ser miembro del tenant ya no basta.
-- - Una operación sin cliente asignado no es visible para el portal (valor por defecto seguro).
-- - Ningún tenant se activa por esta migración ni se inventan códigos externos.
-- - Las tablas nuevas de administración no tienen privilegios para portal_app, anon, authenticated ni PUBLIC.
-- Reversión: supabase/rollback/20261112000000_client_scope.down.sql (solo bases desechables o con copia).

-- El catálogo de tenants observados NO se crea aquí: ya existe en el proyecto remoto como
-- public.logixtic_tenant_discovery (creada manualmente). Su reconciliación va en una migración aparte,
-- tras verificar la estructura real. Ver docs/fase-12-mapa-datos.md (sección 5).

-- ---------------------------------------------------------------------------
-- 1. Sincronización: auditoría de ejecuciones (administración; sin acceso desde el portal)
-- ---------------------------------------------------------------------------
CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'logixtic' CHECK (source_system = 'logixtic'),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  cursor_value text CHECK (cursor_value IS NULL OR char_length(cursor_value) <= 200),
  records_seen integer NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
  records_written integer NOT NULL DEFAULT 0 CHECK (records_written >= 0),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT sync_finished_is_consistent CHECK (
    (status = 'running' AND finished_at IS NULL) OR (status <> 'running' AND finished_at IS NOT NULL)
  )
);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Cliente final dentro del tenant
-- ---------------------------------------------------------------------------
CREATE TABLE client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  legal_name text NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 200),
  tax_id text CHECK (tax_id IS NULL OR char_length(tax_id) BETWEEN 3 AND 40),
  external_client_id text CHECK (external_client_id IS NULL OR char_length(external_client_id) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, external_client_id)
);

ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE client_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('client_admin', 'client_viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_account_id, user_id),
  -- La cuenta debe pertenecer al mismo tenant que la membresía.
  FOREIGN KEY (client_account_id, tenant_id) REFERENCES client_accounts (id, tenant_id) ON DELETE CASCADE,
  -- Solo puede tener acceso a un cliente quien ya es miembro del tenant (misma empresa).
  FOREIGN KEY (user_id, tenant_id) REFERENCES tenant_memberships (user_id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX ix_client_memberships_user_active ON client_memberships (user_id) WHERE active;

ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Operaciones: cliente asignado y procedencia de la sincronización
-- ---------------------------------------------------------------------------
ALTER TABLE operation_refs
  ADD COLUMN client_account_id uuid,
  ADD COLUMN source_updated_at timestamptz,
  ADD COLUMN source_version text CHECK (source_version IS NULL OR char_length(source_version) <= 200),
  ADD COLUMN sync_run_id uuid REFERENCES sync_runs (id) ON DELETE SET NULL,
  ADD CONSTRAINT operation_refs_client_fk
    FOREIGN KEY (client_account_id, tenant_id) REFERENCES client_accounts (id, tenant_id);

CREATE INDEX ix_operation_refs_client ON operation_refs (tenant_id, client_account_id);

-- ---------------------------------------------------------------------------
-- 4. Función de contexto: clientes activos del usuario (solo si la membresía al tenant también está activa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_my_client_account_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT c.client_account_id
      FROM client_memberships c
      JOIN tenant_memberships t ON t.user_id = c.user_id AND t.tenant_id = c.tenant_id
      WHERE c.user_id = portal_current_user_id() AND c.active AND t.active
    $$;

REVOKE ALL ON FUNCTION portal_my_client_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_my_client_account_ids() TO portal_app;

-- ---------------------------------------------------------------------------
-- 5. Políticas: sustitución de las que dependían solo del tenant
-- ---------------------------------------------------------------------------
DROP POLICY operation_refs_member_select ON operation_refs;
CREATE POLICY operation_refs_client_select ON operation_refs FOR SELECT TO portal_app
      USING (client_account_id IN (SELECT portal_my_client_account_ids()));

DROP POLICY operation_events_member_select ON operation_events;
CREATE POLICY operation_events_client_select ON operation_events FOR SELECT TO portal_app
      USING (
        visibility = 'client'
        AND EXISTS (
          SELECT 1 FROM operation_refs o
          WHERE o.id = operation_events.operation_id
            AND o.client_account_id IN (SELECT portal_my_client_account_ids())
        )
      );

DROP POLICY event_comments_member_select ON event_comments;
CREATE POLICY event_comments_client_select ON event_comments FOR SELECT TO portal_app
      USING (
        visibility = 'client'
        AND EXISTS (
          SELECT 1 FROM operation_refs o
          WHERE o.id = event_comments.operation_id
            AND o.client_account_id IN (SELECT portal_my_client_account_ids())
        )
      );

DROP POLICY event_comments_member_insert ON event_comments;
CREATE POLICY event_comments_client_insert ON event_comments FOR INSERT TO portal_app
      WITH CHECK (
        author_id = portal_current_user_id()
        AND author_side = 'client'
        AND visibility = 'client'
        -- Solo un administrador del cliente final puede escribir en sus operaciones.
        AND EXISTS (
          SELECT 1 FROM client_memberships c
          JOIN operation_refs o ON o.client_account_id = c.client_account_id
          WHERE c.user_id = event_comments.author_id AND c.active AND c.role = 'client_admin'
            AND o.id = event_comments.operation_id AND o.tenant_id = event_comments.tenant_id
        )
        AND EXISTS (
          SELECT 1 FROM operation_events e
          WHERE e.id = event_comments.event_id AND e.tenant_id = event_comments.tenant_id
            AND e.visibility = 'client'
        )
      );

DROP POLICY requests_member_select ON requests;
CREATE POLICY requests_owner_or_client_select ON requests FOR SELECT TO portal_app
      USING (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND (
          created_by = portal_current_user_id()
          OR EXISTS (
            SELECT 1 FROM operation_refs o
            WHERE o.id = requests.operation_id
              AND o.client_account_id IN (SELECT portal_my_client_account_ids())
          )
        )
      );

DROP POLICY requests_member_insert ON requests;
CREATE POLICY requests_client_insert ON requests FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND created_by = portal_current_user_id()
        AND status = 'recibida'
        AND (
          operation_id IS NULL
          OR EXISTS (
            SELECT 1 FROM operation_refs o
            WHERE o.id = requests.operation_id
              AND o.client_account_id IN (SELECT portal_my_client_account_ids())
          )
        )
      );

DROP POLICY attachments_member_select ON attachments;
CREATE POLICY attachments_owner_or_request_select ON attachments FOR SELECT TO portal_app
      USING (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND (
          uploaded_by = portal_current_user_id()
          OR EXISTS (SELECT 1 FROM requests r WHERE r.id = attachments.request_id)
        )
      );

DROP POLICY attachments_member_insert ON attachments;
CREATE POLICY attachments_owner_insert ON attachments FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND uploaded_by = portal_current_user_id()
        AND status = 'pending'
        AND (request_id IS NULL OR EXISTS (SELECT 1 FROM requests r WHERE r.id = attachments.request_id))
      );

-- ---------------------------------------------------------------------------
-- 6. Privilegios: lectura de clientes y membresías para portal_app; nada más
-- ---------------------------------------------------------------------------
CREATE POLICY client_accounts_member_select ON client_accounts FOR SELECT TO portal_app
      USING (id IN (SELECT portal_my_client_account_ids()));

CREATE POLICY client_memberships_self_select ON client_memberships FOR SELECT TO portal_app
      USING (user_id = portal_current_user_id());

GRANT SELECT ON client_accounts, client_memberships TO portal_app;

DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON sync_runs, client_accounts, client_memberships FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON sync_runs, client_accounts, client_memberships FROM authenticated;
      END IF;
    END
    $$;

REVOKE ALL ON sync_runs FROM PUBLIC;
REVOKE ALL ON client_accounts, client_memberships FROM PUBLIC;
