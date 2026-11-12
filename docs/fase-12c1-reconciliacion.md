# Fase 12C.1 · Reconciliación SQL y cierre multitenant

**Estado:** verificación parcial. La estructura remota de `logixtic_tenant_discovery` **no está confirmada** y no se
ha aplicado ninguna migración remota. Los pasos marcados como "requiere autorización" esperan su aprobación.

## 1. Estado Git

- Rama `feat/supabase-auth-integration`, commit base `67130db`.
- 38 rutas modificadas o sin seguimiento: fases 11B, 11C, 12 y 12C.1. **Ningún commit ni staging**. El entorno denegó el
  commit en la fase 11C y no se reintentó.
- No hay push, merge ni despliegue.

## 2. Verificación del proyecto remoto (solo lectura)

| Comprobación | Método | Resultado |
|---|---|---|
| Historial de migraciones remoto | `supabase migration list --linked` | Constan `20261111000000` y `20261111000100`. **No consta** `20261112000000`. |
| Migraciones pendientes de subir | `supabase db push --linked --dry-run` | Solo `20261112000000_client_scope.sql`. No se aplicó nada. |
| Existencia de `logixtic_tenant_discovery` | Índices remotos (`inspect db table-stats`) y estadísticas | **Existe.** Tiene índice `pkey`, una restricción única sobre `(source_system, observed_label)` y un índice `uq_logixtic_tenant_discovery_source_id`. |
| Recuento de filas de la tabla de descubrimiento | Estimación de `table-stats` | **9 filas estimadas**, coherente con los nueve nombres observados. El recuento exacto requiere la consulta 7 del archivo de verificación. |
| Recuento de tablas operativas | Estimación de `table-stats` | `tenants`, `profiles`, `operation_refs`, `operation_events`, `requests`, `attachments`, etc. **0 filas estimadas**: no hay datos operativos remotos. Confirmar con la consulta 8. |
| Columnas, restricciones, RLS y políticas de la tabla de descubrimiento | No verificable sin Docker ni conexión | **Pendiente.** `supabase db dump` requiere Docker Desktop, que no está en ejecución. |
| Acceso REST con clave publicable | Consulta HTTP | `logixtic_tenant_discovery` y `tenants` responden 401 (sin permiso para el rol anónimo). `logixtic_tenant_catalog` responde 404: **no existe en remoto**. |
| Rol `portal_api` | No verificable: la URL de la base no resuelve | Pendiente (ver sección 6). |

El archivo `docs/sql/fase-12c1-verificacion-solo-lectura.sql` contiene las consultas que faltan. Son solo `SELECT`, no
muestran filas de la tabla de descubrimiento y se ejecutan en el SQL Editor como propietario.

## 3. Conflictos encontrados

| # | Conflicto | Tratamiento |
|---|---|---|
| C1 | Dos catálogos de tenants: `logixtic_tenant_discovery` (remoto, con 9 filas) y `logixtic_tenant_catalog` (creado en mi migración, sin aplicar). | **Resuelto localmente:** retiré `logixtic_tenant_catalog` de la migración `20261112000000`, de la reversión y de las pruebas. La migración nueva ya no crea ningún catálogo. |
| C2 | La tabla remota no está en el historial de migraciones: desviación entre el esquema real y el repositorio. | **Pendiente.** Hay que reconstruir su definición en una migración reproducible (sección 4). |
| C3 | Los nombres observados (`observed_label`) se preservan, pero no tienen código oficial ni están verificados. | Sin cambios de datos. Se conservan tal cual. |
| C4 | Posibles privilegios por defecto de Supabase sobre tablas nuevas en `public` (`anon`, `authenticated`). | La REST devuelve 401, pero no lo confirma. Se verificará con la consulta 6. |

No hay conflicto de estructura entre la migración `20261112000000` y la tabla remota, porque la migración no crea ninguna tabla
que exista remotamente (`client_accounts`, `client_memberships`, `sync_runs` no existen remotamente).

## 4. Estrategia de reconciliación (reproducible)

**Tabla canónica propuesta:** `logixtic_tenant_discovery`. Conserva los 9 registros y evita un segundo catálogo.

Una nueva migración, `20261112000100_tenant_discovery_reconcile.sql`, que **no** se ha escrito todavía porque necesita la
estructura real verificada:

1. `CREATE TABLE IF NOT EXISTS` con la forma verificada. En una base nueva crea la tabla; en el remoto no hace nada.
2. `ADD COLUMN IF NOT EXISTS` solo para los campos de verificación oficial (código, entorno, estado, tenant del portal,
   referencia de evidencia, fecha de verificación), con sus restricciones:
   - Código oficial único cuando exista.
   - Un tenant solo queda `confirmed` con código, tenant del portal y fecha de verificación.
3. RLS activa y sin privilegios para `portal_app`, `anon`, `authenticated` ni `PUBLIC`.
4. **Sin `DROP` y sin `UPDATE` de los nombres observados.** Las filas existentes se conservan.

Reglas explícitas:

- No usar `supabase migration repair` para registrar la tabla: el historial se registra solo con `db push`, después de verificar.
- Para la base nueva, la migración crea la tabla con la forma verificada; para el remoto, la misma migración es idempotente.
- La verificación de equivalencia se hace comparando `pg_dump --schema-only` de una base desechable migrada desde cero
  con el remoto, y revisando las diferencias antes de cualquier `push`.

## 5. Comandos que requieren autorización

| Comando | Qué hace | Estado |
|---|---|---|
| Ejecutar `docs/sql/fase-12c1-verificacion-solo-lectura.sql` en el SQL Editor | Solo lectura | **Puede hacerlo usted** y pegar el resultado (sin datos personales) |
| `supabase db dump --linked --schema public` | Solo lectura, requiere Docker Desktop | Requiere iniciar Docker Desktop. Lo ejecuta usted o lo autoriza |
| `supabase db push --linked --dry-run` | Solo simulación | Ejecutado: solo lista `20261112000000` |
| `supabase db push --linked` | **Aplica** `20261112000000` y, después, la de reconciliación | **Requiere autorización explícita** |
| `supabase migration repair` | Marca migraciones como aplicadas sin ejecutarlas | **No usar** |
| `supabase db reset` | Borra la base | **Prohibido** en el proyecto remoto |
| Ejecutar `seed.sql` | Datos sintéticos | **Prohibido** en remoto |

## 6. Bloqueos pendientes

1. **`portal_api`:** la URL de la base no resuelve (`DATABASE_URL` no apunta al Session Pooler real). Sin esa cadena no
   puedo verificar el rol ni ejecutar el preflight.
2. **Auth:** el registro público sigue activo (`disable_signup: false`).
3. **Contrato oficial de Logixtic:** sigue sin encontrarse en los repositorios revisados.
4. **Tenants observados:** falta decidir cuáles son productivos o de prueba.

## 7. Pruebas aprobadas (base PostgreSQL desechable local)

- Migraciones `supabase/migrations/` aplicadas desde cero, en orden, sin errores (incluida la nueva).
- Seed sintético aplicado solo en la base desechable.
- Suite de la API con la base migrada: **124 aprobadas, 1 omitida** (solo se ejecuta en Supabase).
- Lint y formato de la API: pasan.
- Reversión de la migración probada en base separada.
- Dry-run de `supabase db push` contra el remoto: correcto.

Las pruebas del nivel B verifican que dos clientes finales de la misma empresa no se ven mutuamente, que una membresía
de tenant no concede acceso a un cliente sin membresía de cliente, y que una clave compuesta impide asignar a alguien de
otra empresa. **No hay una prueba específica** de que un código o nombre externo de tenant no conceda acceso: esa
garantía viene de que el acceso solo depende de membresías y de RLS, pero conviene añadir esa prueba antes de sincronizar.

## 8. Próximo paso

Con el resultado de la consulta de verificación (o un `db dump` con Docker), escribo la migración de reconciliación y la
pruebo en una base desechable. Después, con su autorización, se aplica con `db push`.

## 9. Evidencias confirmadas por el responsable (fase 12C.2)

| Evidencia | Valor |
|---|---|
| Registros en `logixtic_tenant_discovery` | 9 (recuento exacto confirmado) |
| Tenants verificados | 0 |
| Registros con identificador externo oficial | 0 |
| Historial remoto | `20261111000000`, `20261111000100` |
| `20261112000000_client_scope.sql` aplicada en remoto | No |

Con estas evidencias, los nueve nombres observados siguen siendo solo nombres: ninguno tiene autorización ni código oficial.

### Bloqueo para la migración de reconciliación

La migración de reconciliación no puede escribirse de forma segura sin la **estructura real** de la tabla. Faltan:

1. La salida de `docs/sql/fase-12c1-verificacion-solo-lectura.sql` (consultas 2 a 6: columnas, restricciones, índices, RLS, políticas y privilegios), o
2. El script SQL original que se ejecutó manualmente, o
3. Un `supabase db dump --linked --schema public` con Docker Desktop iniciado.

Escribir `CREATE TABLE` o `ADD COLUMN` a partir de nombres de índices sería inventar la estructura. Esa conjetura podría
dejar incompatibilidades ocultas en el remoto, justo lo que la fase prohíbe.

Estado de Docker al cierre de esta vuelta: no disponible. El dry-run remoto vuelve a listar solo `20261112000000_client_scope.sql`.

### Plan una vez recibida la estructura

1. Comparar columna por columna, restricción por restricción, índice por índice, RLS y privilegios contra la definición que se
   escriba en la migración.
2. Migración `20261112000100_tenant_discovery_reconcile.sql`: definición completa del catálogo, sin `IF NOT EXISTS` que
   oculte diferencias, y comprobaciones explícitas que fallen si la estructura remota no coincide.
3. Probar en base desechable desde cero y con el catálogo previo creado con el SQL original.
4. Verificar que los nueve registros se conservan y que `anon`, `authenticated` y `portal_app` no tienen acceso.
5. Ejecutar las pruebas del backend (124 esperadas) y el dry-run.
6. Aplicar en remoto solo con autorización explícita.

### Pendientes independientes (no bloquean la reconciliación)

- Creación y validación de `portal_api`.
- Conexión real del Session Pooler.
- Configuración de Supabase Auth (registro público activo).
- Identificadores oficiales de los tenants.
- Contrato de integración con el SaaS de Logixtic.

> **Actualización (fase 12C.2):** el plan de esta sección se ejecutó. Ver `docs/fase-12c2-reconciliacion-catalogo.md`.
