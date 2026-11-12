#!/usr/bin/env bash
# Escenarios de verificación de 20261112000100_tenant_discovery_reconcile.sql.
#
# Seguridad: solo funciona contra un PostgreSQL LOCAL (127.0.0.1 o localhost) y solo crea bases con prefijo
# "scratch_". Nunca toca el proyecto remoto. Crea roles de simulación anon/authenticated solo si faltan
# (en Supabase existen; en un PostgreSQL local no).
#
# Uso:
#   PG_HOST=127.0.0.1 PG_PORT=5432 PG_USER=postgres scripts/sql/verify_tenant_discovery_reconcile.sh
set -euo pipefail

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
if [[ "$PG_HOST" != "127.0.0.1" && "$PG_HOST" != "localhost" ]]; then
  echo "Negado: este script solo ejecuta contra PostgreSQL local (PG_HOST=$PG_HOST)." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
ORIG="$ROOT/docs/sql/historico/logixtic_tenant_discovery_manual_original.sql"
export PGCLIENTENCODING=UTF8
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql_admin() { psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -v ON_ERROR_STOP=1 -q "$@"; }
psql_db()    { psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$1" -v ON_ERROR_STOP=1 -q -f "$2"; }
fresh_db()   { psql_admin -c "DROP DATABASE IF EXISTS scratch_$1;" -c "CREATE DATABASE scratch_$1;" >/dev/null 2>&1; }
count_rows() { psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "scratch_$1" -tA -c "SELECT count(*) FROM public.logixtic_tenant_discovery"; }
pass() { echo "PASA  $1"; }
fail() { echo "FALLA $1"; exit 1; }

# Roles de simulación (solo si faltan): equivalen a los roles que Supabase ya provee.
psql_admin -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='portal_app') THEN CREATE ROLE portal_app NOLOGIN NOBYPASSRLS; END IF;
END \$\$;" >/dev/null

# Escenario 1: instalación limpia, todas las migraciones en orden.
fresh_db limpia
for f in $(ls "$MIG"/*.sql | sort); do psql_db scratch_limpia "$f" >"$TMP/log" 2>&1 || { cat "$TMP/log"; fail "E1 migración $(basename "$f")"; }; done
[[ "$(count_rows limpia)" == "9" ]] && pass "E1 instalación limpia: 9 nombres observados" || fail "E1 recuento"
[[ "$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d scratch_limpia -tA -c "SELECT count(*) FROM public.logixtic_tenant_discovery WHERE verification_status <> 'unverified'")" == "0" ]] \
  && pass "E1 ninguna fila verificada" || fail "E1 filas verificadas"

# Escenario 2: catálogo preexistente creado con el SQL manual original; reconciliación sin borrar ni duplicar.
fresh_db existente
psql_db scratch_existente "$MIG/20261111000000_foundation.sql" >/dev/null 2>&1
psql_db scratch_existente "$MIG/20261111000100_supabase_grants_hardening.sql" >/dev/null 2>&1
psql_db scratch_existente "$ORIG" >"$TMP/log" 2>&1 || { cat "$TMP/log"; fail "E2 SQL manual original"; }
psql_db scratch_existente "$MIG/20261112000000_client_scope.sql" >/dev/null 2>&1 || fail "E2 client_scope"
psql_db scratch_existente "$MIG/20261112000100_tenant_discovery_reconcile.sql" >"$TMP/log" 2>&1 || { cat "$TMP/log"; fail "E2 reconciliación"; }
psql_db scratch_existente "$MIG/20261112000100_tenant_discovery_reconcile.sql" >/dev/null 2>&1 || fail "E2 segunda ejecución"
[[ "$(count_rows existente)" == "9" ]] && pass "E2 catálogo preexistente: 9 filas, sin duplicados, segunda ejecución idempotente" || fail "E2 recuento"

# Escenario 3 y mutaciones: cada incompatibilidad debe detenerse con un mensaje claro y sin modificar la tabla.
mutate() {
  local name="$1" sql="$2" expected="$3"
  fresh_db mut
  psql_db scratch_mut "$MIG/20261111000000_foundation.sql" >/dev/null 2>&1
  psql_db scratch_mut "$MIG/20261111000100_supabase_grants_hardening.sql" >/dev/null 2>&1
  psql_db scratch_mut "$ORIG" >/dev/null 2>&1
  psql_admin -d scratch_mut -c "$sql" >/dev/null 2>&1
  psql_db scratch_mut "$MIG/20261112000000_client_scope.sql" >/dev/null 2>&1
  if psql_db scratch_mut "$MIG/20261112000100_tenant_discovery_reconcile.sql" >"$TMP/log" 2>&1; then
    fail "E3 $name: no detectó la incompatibilidad"
  fi
  if grep -q "$expected" "$TMP/log"; then
    pass "E3 $name: detectada con mensaje claro"
  else
    cat "$TMP/log"; fail "E3 $name: mensaje inesperado"
  fi
}
mutate "tipo de observed_label" "ALTER TABLE public.logixtic_tenant_discovery ALTER COLUMN observed_label TYPE varchar(200);" "observed_label no coincide"
mutate "RLS desactivada" "ALTER TABLE public.logixtic_tenant_discovery DISABLE ROW LEVEL SECURITY;" "RLS no está activa"
mutate "privilegio a portal_app" "GRANT SELECT ON public.logixtic_tenant_discovery TO portal_app;" "privilegio(s) directo(s)"
mutate "columna extra" "ALTER TABLE public.logixtic_tenant_discovery ADD COLUMN extra_no_permitida text;" "número de columnas 8"
mutate "política RLS añadida" "CREATE POLICY mala ON public.logixtic_tenant_discovery FOR SELECT TO portal_app USING (true);" "políticas RLS"

echo "Todos los escenarios pasaron. Bases scratch_* creadas en $PG_HOST:$PG_PORT (elimínelas al terminar)."
