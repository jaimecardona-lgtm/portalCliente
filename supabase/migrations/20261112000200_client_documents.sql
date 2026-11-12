-- 20261112000200_client_documents
-- Documentos de operación del cliente final en Supabase Storage (bucket privado logixtic-client-documents).
--
-- Principios:
-- - Solo AÑADE estructuras y amplía una restricción nueva. No modifica migraciones aplicadas.
-- - `attachments` (solicitudes) no se toca. Los documentos de operación tienen su propio modelo porque necesitan
--   cliente final, versión vigente y estado de retirada.
-- - El portal NO escribe rutas libres: la ruta del objeto la genera FastAPI con UUID. Esta tabla solo guarda la
--   referencia vigente (`storage_path`) y su integridad (`sha256`, `size_bytes`).
-- - Ninguna URL firmada se guarda aquí. Los enlaces se generan on demand.
-- - Autorización: el documento es visible si su cliente final está asignado al usuario (membresía de cliente
--   activa y membresía de tenant activa). Subir, reemplazar y retirar exige client_admin del cliente.
-- - Retirar un documento no borra su fila: pasa a 'removed' sin ruta. El borrado del objeto lo hace la API y, si
--   falla, queda una fila en storage_cleanup_jobs para reintento.

-- ---------------------------------------------------------------------------
-- 1. Clave compuesta que permite referenciar una operación con su tenant y su cliente final
-- ---------------------------------------------------------------------------
ALTER TABLE operation_refs
  ADD CONSTRAINT operation_refs_scope_key UNIQUE (id, tenant_id, client_account_id);

-- ---------------------------------------------------------------------------
-- 2. Documentos de operación
-- ---------------------------------------------------------------------------
CREATE TABLE client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_account_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf', 'image/png', 'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_bucket text NOT NULL DEFAULT 'logixtic-client-documents'
    CHECK (storage_bucket = 'logixtic-client-documents'),
  storage_path text CHECK (storage_path IS NULL OR char_length(storage_path) BETWEEN 1 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'removed')),
  uploaded_by uuid NOT NULL REFERENCES profiles (id),
  updated_by uuid REFERENCES profiles (id),
  removed_by uuid REFERENCES profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (id, tenant_id, client_account_id, operation_id),
  UNIQUE (storage_path),
  -- El documento pertenece a una operación del cliente final indicado y de la misma empresa.
  FOREIGN KEY (operation_id, tenant_id, client_account_id)
    REFERENCES operation_refs (id, tenant_id, client_account_id) ON DELETE CASCADE,
  FOREIGN KEY (client_account_id, tenant_id) REFERENCES client_accounts (id, tenant_id),
  -- Estados coherentes: un documento disponible tiene ruta; uno retirado no tiene ruta y sí fecha de retirada.
  CONSTRAINT client_documents_available_has_path CHECK (
    status <> 'available' OR (storage_path IS NOT NULL AND removed_at IS NULL)
  ),
  CONSTRAINT client_documents_removed_has_no_path CHECK (
    status <> 'removed' OR (storage_path IS NULL AND removed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_client_documents_scope ON client_documents (id, tenant_id, client_account_id);

CREATE INDEX ix_client_documents_operation ON client_documents (tenant_id, operation_id) WHERE status = 'available';

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Auditoría mínima de documentos (solo inserción desde la API; lectura administrativa)
-- ---------------------------------------------------------------------------
CREATE TABLE client_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  client_account_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES profiles (id),
  action text NOT NULL CHECK (action IN ('uploaded', 'replaced', 'removed')),
  version integer NOT NULL CHECK (version >= 1),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Enlace al documento y a su cliente final. No depende del estado del documento (puede estar retirado).
  FOREIGN KEY (document_id, tenant_id, client_account_id)
    REFERENCES client_documents (id, tenant_id, client_account_id) ON DELETE CASCADE
);

ALTER TABLE client_document_events ENABLE ROW LEVEL SECURITY;

-- Cola de limpieza de objetos de Storage pendientes (compensaciones durables).
-- Sin ruta libre: la ruta la genera la API. El reintento lo ejecuta un procedimiento administrativo.
CREATE TABLE storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'logixtic-client-documents'
    CHECK (storage_bucket = 'logixtic-client-documents'),
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 1 AND 500),
  reason text NOT NULL CHECK (reason IN ('replaced', 'removed', 'insert_failed', 'upload_incomplete')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (storage_bucket, storage_path)
);

ALTER TABLE storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Función de contexto: clientes finales donde el usuario es administrador (membresías activas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_my_client_admin_account_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT c.client_account_id
      FROM client_memberships c
      JOIN tenant_memberships t ON t.user_id = c.user_id AND t.tenant_id = c.tenant_id
      WHERE c.user_id = portal_current_user_id() AND c.active AND c.role = 'client_admin'
        AND t.active
    $$;

REVOKE ALL ON FUNCTION portal_my_client_admin_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_my_client_admin_account_ids() TO portal_app;

-- ---------------------------------------------------------------------------
-- 5. Políticas RLS
-- ---------------------------------------------------------------------------
-- Lectura: documentos disponibles de clientes finales asignados al usuario.
-- Los administradores del cliente también leen documentos retirados: PostgreSQL aplica esta política a la fila
-- nueva de un UPDATE (la retirada deja la fila en 'removed'). Los listados y enlaces filtran por estado.
-- Los miembros que no son administradores nunca ven documentos retirados.
CREATE POLICY client_documents_client_select ON client_documents FOR SELECT TO portal_app
      USING (
        (status = 'available' AND client_account_id IN (SELECT portal_my_client_account_ids()))
        OR client_account_id IN (SELECT portal_my_client_admin_account_ids())
      );

-- Alta: solo administradores del cliente final, con la operación de ese mismo cliente.
CREATE POLICY client_documents_admin_insert ON client_documents FOR INSERT TO portal_app
      WITH CHECK (
        uploaded_by = portal_current_user_id()
        AND client_account_id IN (SELECT portal_my_client_admin_account_ids())
        AND status = 'available'
        AND removed_at IS NULL
      );

-- Cambios (reemplazo y retirada): solo administradores del cliente final del documento.
CREATE POLICY client_documents_admin_update ON client_documents FOR UPDATE TO portal_app
      USING (client_account_id IN (SELECT portal_my_client_admin_account_ids()))
      WITH CHECK (client_account_id IN (SELECT portal_my_client_admin_account_ids()));

-- Auditoría: inserción por administradores del cliente; sin lectura para el portal.
CREATE POLICY client_document_events_admin_insert ON client_document_events FOR INSERT TO portal_app
      WITH CHECK (
        actor_id = portal_current_user_id()
        AND client_account_id IN (SELECT portal_my_client_admin_account_ids())
      );

-- Cola de limpieza: la API solo puede encolar (no leer ni modificar desde el portal).
CREATE POLICY storage_cleanup_jobs_insert ON storage_cleanup_jobs FOR INSERT TO portal_app
      WITH CHECK (
        tenant_id IN (SELECT portal_my_tenant_ids())
        AND status = 'pending'
        AND attempts = 0
      );

-- ---------------------------------------------------------------------------
-- 6. Privilegios explícitos
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON client_documents TO portal_app;
GRANT INSERT ON client_document_events TO portal_app;
GRANT INSERT ON storage_cleanup_jobs TO portal_app;

DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON client_documents, client_document_events, storage_cleanup_jobs FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON client_documents, client_document_events, storage_cleanup_jobs FROM authenticated;
      END IF;
    END
    $$;

REVOKE ALL ON client_documents, client_document_events, storage_cleanup_jobs FROM PUBLIC;
