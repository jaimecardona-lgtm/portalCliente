# Estrategia de migraciones de base de datos

**Fuente canónica del esquema:** `supabase/migrations/*.sql`, aplicadas con Supabase CLI.

**Referencia histórica:** `apps/api/migrations/versions/` (Alembic). Se conserva para trazabilidad y para
verificar la equivalencia. **No se ejecuta sobre ningún esquema que use la fuente de Supabase.**

## 1. Regla principal

Un esquema tiene un único historial de migraciones. Nunca Alembic y Supabase CLI aplicando cambios sobre las
mismas tablas. Cualquier cambio nuevo del esquema se escribe como un archivo nuevo en `supabase/migrations/`.

## 2. Equivalencia entre historiales

| Alembic (histórico) | Supabase CLI (canónico) | Contenido |
|---|---|---|
| `0001_foundation` (revisión `0001_foundation`) | `20261111000000_foundation.sql` | Tablas, claves compuestas, restricciones, funciones de contexto, RLS y rol `portal_app`. |
| `0002_supabase_grants_hardening` | `20261111000100_supabase_grants_hardening.sql` | Retira privilegios de `anon`, `authenticated` y `PUBLIC`. |

Los archivos SQL se generaron a partir de las mismas sentencias que ejecuta Alembic, sin transcribirlas a mano.
La comprobación de equivalencia **a nivel de base de datos** (diferencia de `pg_dump --schema-only`) debe
ejecutarse sobre una base desechable antes de aplicar nada en un proyecto real. Ver la sección 6.

## 3. Instalaciones nuevas

Requisitos: Supabase CLI instalada. Para desarrollo local con `supabase start` se necesita Docker.

Desarrollo local, sobre una base desechable del CLI:

```bash
supabase start                 # levanta Postgres local en Docker (no toca ningún proyecto remoto)
supabase migration up          # aplica supabase/migrations/*.sql en orden
supabase db reset              # reaplica migraciones y seed.sql: SOLO en la base local desechable
```

Proyecto de desarrollo en Supabase (con autorización explícita):

```bash
supabase link --project-ref <ref-del-proyecto-de-desarrollo>
supabase db push --dry-run     # revisar SIEMPRE antes
supabase db push               # aplica las migraciones pendientes
```

Prohibiciones:

- `supabase db reset` **nunca** contra una base compartida, remota o con datos que deban conservarse.
- No aplicar migraciones en producción sin revisión y copia de seguridad.
- `seed.sql` solo para bases desechables. Contiene datos sintéticos. **Prohibido ejecutarlo en presentación, staging o producción** (política de datos reales, `CLAUDE.md`).

Después de aplicar, para crear usuarios de desarrollo: crear el usuario en Supabase Auth y ejecutar
`apps/api/scripts/provision_dev.py` (ver `docs/supabase-preparation.md`).

## 4. Base existente con `alembic_version` (transición sin recrear tablas)

Escenario: una base de desarrollo ya tiene el esquema creado por Alembic y la tabla `alembic_version`.
Objetivo: pasar a Supabase CLI como fuente única **sin recrear tablas ni perder datos**.

Procedimiento (cada paso requiere autorización del responsable de la base):

1. **Copia de seguridad completa** antes de cualquier cambio:
   `pg_dump --format=custom --file=backup-antes-transicion.dump "<url>"`.
2. **Comprobar la versión** de Alembic: `SELECT version_num FROM alembic_version;` debe devolver
   `0002_supabase_grants_hardening`. Si devuelve `0001_foundation`, el paso 3 solo debe marcar la 0001 como aplicada.
3. **Marcar como aplicadas** las migraciones de Supabase **sin ejecutarlas**:
   ```bash
   supabase migration repair --status applied 20261111000000
   supabase migration repair --status applied 20261111000100   # solo si la base está en 0002
   ```
   Esto registra el historial en `supabase_migrations.schema_migrations`. No modifica tablas.
4. **Verificar la equivalencia** sobre una **copia** de la base (no sobre la original): `pg_dump --schema-only`
   de la copia frente a una base desechable creada con `supabase migration up`. Las diferencias deben ser nulas
   o justificadas.
5. **Retirar la tabla de control de Alembic**, solo después de los pasos 3 y 4 y con autorización:
   `DROP TABLE alembic_version;`. No afecta a los datos del portal.
6. **Desde ese momento**, los cambios se escriben solo como archivos nuevos en `supabase/migrations/`.

Si la verificación del paso 4 falla, **no** continuar: restaurar desde la copia de seguridad y analizar la diferencia.

## 5. Reversión

| Migración | Reversión | Advertencia |
|---|---|---|
| `20261111000000_foundation` | `supabase/rollback/20261111000000_foundation.down.sql` | **Elimina tablas y datos del portal.** Uso exclusivo en bases desechables o tras copia de seguridad. No está en `supabase/migrations/`, así que Supabase CLI no la aplica. |
| `20261111000100_supabase_grants_hardening` | Sin script. | Restaurar privilegios amplios sería menos seguro. Si se necesita revertir, restaurar desde copia de seguridad. |

Cómo revertir una migración ya aplicada en un entorno real: no existe “deshacer” sin pérdida. El procedimiento
es restaurar la copia de seguridad previa y volver a aplicar hasta la versión deseada.

## 6. Verificación antes de aplicar en un proyecto

Sobre una base PostgreSQL desechable (local, sin datos reales):

1. Crear la base desechable y aplicar `supabase/migrations/*.sql` en orden.
2. Ejecutar la suite de integración de la API con `PORTAL_TEST_DATABASE_URL` apuntando a esa base.
3. Comprobar que `anon` y `authenticated` no tienen privilegios sobre las tablas del portal
   (`has_table_privilege`), y que `portal_app` no tiene `BYPASSRLS`.
4. Opcional: crear otra base desechable con Alembic, comparar ambos esquemas con `pg_dump --schema-only`.

La prueba `test_public_api_roles_have_no_portal_privileges` se omite cuando los roles `anon` y `authenticated`
no existen (PostgreSQL local); con Supabase real debe ejecutarse.

## 7. Estado de verificación de esta fase

- Las migraciones SQL se generaron desde el código Alembic. **No se han ejecutado todavía**: el PostgreSQL local
  no responde y Docker no está en marcha por falta de memoria. Pendiente de ejecutar.
- Supabase CLI 2.48.3 instalada; no se ha ejecutado `supabase db lint` ni `supabase migration up`, porque requieren Docker.
- Ningún cambio se ha aplicado a un proyecto remoto.
