-- 20261112000100_tenant_discovery_reconcile
-- Fase 12C.2: hace reproducible el catálogo public.logixtic_tenant_discovery.
--
-- La tabla se creó a mano en Supabase SQL Editor (definición en docs/sql/historico/, solo referencia).
-- Esta migración:
--   1. Crea la tabla SOLO si no existe (instalación limpia).
--   2. Si ya existe, NO la recrea: verifica estructura, restricciones, índices, RLS, políticas y privilegios.
--      Cualquier diferencia hace fallar la migración con un mensaje claro. No hay IF NOT EXISTS que oculte diferencias.
--   3. Registra los nueve nombres observados de forma idempotente (ON CONFLICT DO NOTHING). No modifica filas existentes.
--
-- Garantías:
-- - Los nombres observados NO son identificadores oficiales ni conceden acceso. Ninguna fila pasa a 'verified'.
-- - Acceso denegado para PUBLIC, anon, authenticated y portal_app; cero políticas RLS.
-- - No borra ni recrea la tabla, no toca el historial de migraciones.

-- ---------------------------------------------------------------------------
-- 1. Creación condicional (solo instalación limpia)
-- ---------------------------------------------------------------------------
DO $create$
    BEGIN
      IF to_regclass('public.logixtic_tenant_discovery') IS NULL THEN
        CREATE TABLE public.logixtic_tenant_discovery (
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

        CREATE UNIQUE INDEX uq_logixtic_tenant_discovery_source_id
          ON public.logixtic_tenant_discovery (source_system, external_tenant_id)
          WHERE external_tenant_id IS NOT NULL;

        ALTER TABLE public.logixtic_tenant_discovery ENABLE ROW LEVEL SECURITY;
      END IF;
    END
    $create$;

COMMENT ON TABLE public.logixtic_tenant_discovery IS
  'Manual observation queue only. Not an authorization source. Never expose to clients. Replace with verified immutable Logixtic IDs via an approved integration.';

-- ---------------------------------------------------------------------------
-- 2. Verificación estricta de la estructura (falla si la tabla existente no coincide)
-- ---------------------------------------------------------------------------
DO $verify$
    DECLARE
      problemas text[] := ARRAY[]::text[];
      tabla oid := 'public.logixtic_tenant_discovery'::regclass;
      n integer;
      fila record;
    BEGIN
      -- Número exacto de columnas.
      SELECT count(*) INTO n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'logixtic_tenant_discovery';
      IF n <> 7 THEN
        problemas := array_append(problemas, format('número de columnas %s (se esperaban 7)', n));
      END IF;

      -- Columnas: tipo, nulabilidad y valor por defecto exactos.
      FOR fila IN
        SELECT * FROM (VALUES
          ('id', 'uuid', 'NO', 'gen_random_uuid()'),
          ('source_system', 'text', 'NO', '''logixtic''::text'),
          ('observed_label', 'text', 'NO', NULL::text),
          ('external_tenant_id', 'text', 'YES', NULL::text),
          ('verification_status', 'text', 'NO', '''unverified''::text'),
          ('first_observed_at', 'timestamp with time zone', 'NO', 'now()'),
          ('verified_at', 'timestamp with time zone', 'YES', NULL::text)
        ) AS e(nombre, tipo, nulable, por_defecto)
      LOOP
        PERFORM 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = 'logixtic_tenant_discovery'
            AND c.column_name = fila.nombre
            AND c.data_type = fila.tipo
            AND c.is_nullable = fila.nulable
            AND coalesce(c.column_default, '<sin_defecto>') = coalesce(fila.por_defecto, '<sin_defecto>');
        IF NOT FOUND THEN
          problemas := array_append(problemas, format('columna %s no coincide (tipo, nulidad o default)', fila.nombre));
        END IF;
      END LOOP;

      -- Restricciones con nombre y tipo exactos.
      FOR fila IN
        SELECT * FROM (VALUES
          ('logixtic_tenant_discovery_pkey', 'p'),
          ('logixtic_tenant_discovery_source_system_observed_label_key', 'u'),
          ('logixtic_tenant_discovery_observed_label_check', 'c'),
          ('logixtic_tenant_discovery_source_system_check', 'c'),
          ('logixtic_tenant_discovery_verification_status_check', 'c'),
          ('verified_requires_id', 'c')
        ) AS e(nombre, tipo)
      LOOP
        PERFORM 1 FROM pg_constraint k
          WHERE k.conrelid = tabla AND k.conname = fila.nombre AND k.contype::text = fila.tipo;
        IF NOT FOUND THEN
          problemas := array_append(problemas, format('restricción %s (tipo %s) ausente', fila.nombre, fila.tipo));
        END IF;
      END LOOP;

      -- Definiciones de las restricciones de comprobación (literales clave).
      PERFORM 1 FROM pg_constraint k
        WHERE k.conrelid = tabla AND k.conname = 'logixtic_tenant_discovery_verification_status_check'
          AND pg_get_constraintdef(k.oid) LIKE '%unverified%' AND pg_get_constraintdef(k.oid) LIKE '%rejected%'
          AND pg_get_constraintdef(k.oid) LIKE '%verified%';
      IF NOT FOUND THEN
        problemas := array_append(problemas, 'la restricción de estados de verificación no tiene los valores esperados');
      END IF;

      PERFORM 1 FROM pg_constraint k
        WHERE k.conrelid = tabla AND k.conname = 'logixtic_tenant_discovery_source_system_check'
          AND pg_get_constraintdef(k.oid) LIKE '%logixtic%';
      IF NOT FOUND THEN
        problemas := array_append(problemas, 'la restricción source_system no tiene el valor esperado');
      END IF;

      PERFORM 1 FROM pg_constraint k
        WHERE k.conrelid = tabla AND k.conname = 'verified_requires_id'
          AND pg_get_constraintdef(k.oid) LIKE '%external_tenant_id%'
          AND pg_get_constraintdef(k.oid) LIKE '%verified_at%';
      IF NOT FOUND THEN
        problemas := array_append(problemas, 'verified_requires_id no exige identificador y fecha de verificación');
      END IF;

      -- Número exacto de restricciones de tabla (clave primaria, única, comprobaciones y foránea).
      SELECT count(*) INTO n FROM pg_constraint
        WHERE conrelid = tabla AND contype IN ('p', 'u', 'c', 'f', 'x');
      IF n <> 6 THEN
        problemas := array_append(problemas, format('número de restricciones %s (se esperaban 6)', n));
      END IF;

      -- Índices: exactamente tres, y el parcial único con su predicado.
      SELECT count(*) INTO n FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery';
      IF n <> 3 THEN
        problemas := array_append(problemas, format('número de índices %s (se esperaban 3)', n));
      END IF;

      PERFORM 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery'
          AND indexname = 'uq_logixtic_tenant_discovery_source_id'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
          AND indexdef LIKE '%(source_system, external_tenant_id)%'
          AND indexdef LIKE '%WHERE (external_tenant_id IS NOT NULL)%';
      IF NOT FOUND THEN
        problemas := array_append(problemas, 'índice uq_logixtic_tenant_discovery_source_id ausente o distinto');
      END IF;

      -- RLS activa y ninguna política.
      PERFORM 1 FROM pg_class WHERE oid = tabla AND relrowsecurity;
      IF NOT FOUND THEN
        problemas := array_append(problemas, 'RLS no está activa');
      END IF;

      SELECT count(*) INTO n FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'logixtic_tenant_discovery';
      IF n <> 0 THEN
        problemas := array_append(problemas, format('existen %s políticas RLS (se esperaban 0)', n));
      END IF;

      -- Privilegios: ninguno para PUBLIC, anon, authenticated ni portal_app (propietario excluido).
      SELECT count(*) INTO n FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = tabla)) a
        WHERE a.grantee = 0
           OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'portal_app'));
      IF n <> 0 THEN
        problemas := array_append(problemas, format('%s privilegio(s) directo(s) para PUBLIC, anon, authenticated o portal_app', n));
      END IF;

      IF array_length(problemas, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'Estructura incompatible de public.logixtic_tenant_discovery: %',
          array_to_string(problemas, '; ')
          USING HINT = 'No se modifica la tabla. Compare con docs/sql/historico/logixtic_tenant_discovery_manual_original.sql.';
      END IF;
    END
    $verify$;

-- ---------------------------------------------------------------------------
-- 3. Privilegios: revocar explícitamente (idempotente). anon y authenticated solo si existen.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.logixtic_tenant_discovery FROM PUBLIC, portal_app;

DO $revoke$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.logixtic_tenant_discovery FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.logixtic_tenant_discovery FROM authenticated;
      END IF;
    END
    $revoke$;

-- ---------------------------------------------------------------------------
-- 4. Nombres observados (idempotente). Sin IDs, códigos, NIT ni membresías.
-- ---------------------------------------------------------------------------
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
ON CONFLICT (source_system, observed_label) DO NOTHING;

DO $check_rows$
    DECLARE
      faltan text[];
    BEGIN
      SELECT array_agg(e.nombre) INTO faltan
        FROM (VALUES
          ('CLM CARGO'), ('Capacity Tenant 01'), ('Capacity Tenant 02'), ('Capacity Tenant 03'),
          ('Demo Logixtic'), ('D' || chr(180) || 'MAG LOGISTIC SAS'), ('Global Trade Business'),
          ('ITALIAN SHIPPING'), ('Line Cargo S.A.S')
        ) AS e(nombre)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.logixtic_tenant_discovery d
          WHERE d.source_system = 'logixtic' AND d.observed_label = e.nombre
        );
      IF faltan IS NOT NULL THEN
        RAISE EXCEPTION 'Faltan nombres observados tras la reconciliación: %', array_to_string(faltan, ', ');
      END IF;
    END
    $check_rows$;
