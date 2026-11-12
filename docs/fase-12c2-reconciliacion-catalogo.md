# Fase 12C.2 · Reconciliación del catálogo `logixtic_tenant_discovery`

**Estado:** migración escrita y probada en local. **No aplicada en remoto.** Requiere autorización para `supabase db push`.

## 1. Migraciones

| Versión | Archivo | Estado |
|---|---|---|
| 20261111000000 | `foundation.sql` | Aplicada en remoto. Sin cambios. |
| 20261111000100 | `supabase_grants_hardening.sql` | Aplicada en remoto. Sin cambios. |
| 20261112000000 | `client_scope.sql` | Pendiente. Sin catálogo (se retiró el duplicado). |
| 20261112000100 | `tenant_discovery_reconcile.sql` | Pendiente. Nueva en esta fase. |

Reversiones: `client_scope.down.sql` (probada: vuelven 12 políticas, desaparecen tablas nuevas) y
`tenant_discovery_reconcile.down.sql` (vacía a propósito: la tabla y sus registros existían antes).

No se modificó ninguna migración ya aplicada ni el historial remoto. No se usó `migration repair`.

## 2. Comparación estructural: SQL manual original frente a auditoría remota frente a la migración

| Elemento | SQL manual original | Auditoría remota | Migración `20261112000100` |
|---|---|---|---|
| Columnas | 7: `id`, `source_system`, `observed_label`, `external_tenant_id`, `verification_status`, `first_observed_at`, `verified_at` | Las mismas 7, mismos tipos, nulidad y defaults | Verifica las 7 con tipo, nulidad y default exactos |
| Restricciones | PK, `UNIQUE(source_system, observed_label)`, 3 CHECK de columna, `verified_requires_id` | Las 6 con los mismos nombres | Verifica nombre y tipo de cada una, cuenta exacta (6) y literales clave de cada CHECK |
| Índices | PK, unique `(source_system, observed_label)`, unique parcial `uq_..._source_id` | Los 3 | Verifica cantidad (3) y la definición del parcial (`WHERE external_tenant_id IS NOT NULL`) |
| RLS | Activada | Activada | Verifica `relrowsecurity` |
| Políticas | Ninguna | 0 | Verifica 0 |
| Privilegios | Revocados a PUBLIC, anon, authenticated, portal_app | Ninguno para anon, authenticated ni portal_app | Verifica que `relacl` no tenga entradas para PUBLIC, anon, authenticated ni portal_app; revoca de nuevo |
| Filas | 9 nombres observados | 9 (confirmado) | Inserta los 9 con `ON CONFLICT DO NOTHING`; verifica que existen; no modifica las existentes |
| Verificados / con ID oficial | 0 / 0 | 0 / 0 | No cambia ninguna fila |

**Coincidencia:** la auditoría remota coincide con el SQL original en todos los elementos que reportó. La migración
comprueba esos mismos elementos en cualquier base. Lo que la auditoría no reportó (el texto exacto de los CHECK) lo
comprueba la migración por literales clave, no por igualdad textual completa. Esa diferencia está documentada.

## 3. Comportamiento de la migración

1. **Instalación limpia:** crea la tabla, el índice parcial, el comentario y la RLS. No usa `IF NOT EXISTS`.
2. **Tabla existente:** no la recrea. Verifica la estructura completa y **falla con un mensaje claro** si algo no coincide.
   El fallo no modifica la tabla.
3. Revoca privilegios explícitamente (idempotente).
4. Registra los nueve nombres (idempotente) y comprueba que los nueve existen.

Corrección realizada durante las pruebas: la acumulación de errores usaba `text[] || text`, que PostgreSQL interpreta
como literal de array y producía un error confuso en lugar del mensaje. Ahora usa `array_append`.

## 4. Pruebas (base PostgreSQL local desechable, prefijo `scratch_`)

Script reproducible: `scripts/sql/verify_tenant_discovery_reconcile.sh`. Solo funciona contra un PostgreSQL local.

| Escenario | Resultado |
|---|---|
| E1 · Instalación limpia (todas las migraciones en orden) | **PASA**: 9 nombres, ninguno verificado |
| E2 · Catálogo previo creado con el SQL manual original, luego reconciliación | **PASA**: 9 filas, sin duplicados; segunda ejecución idempotente |
| E3 · Tipo de `observed_label` cambiado a `varchar(200)` | **PASA**: detectado, mensaje claro |
| E3 · RLS desactivada | **PASA**: detectado, mensaje claro |
| E3 · Privilegio directo para `portal_app` | **PASA**: detectado, mensaje claro |
| E3 · Columna extra | **PASA**: detectado (8 columnas) |
| E3 · Política RLS añadida | **PASA**: detectado (1 política) |

Pruebas de la API con la base migrada desde cero (incluidas las 5 nuevas del catálogo):

- Suite de integración: **129 aprobadas**, 0 omitidas, 0 fallidas.
- Sin base de datos: **57 aprobadas**, 72 omitidas (las de integración).
- Lint y formato (Ruff): pasan.

Conteo: la fase anterior reportó 124 aprobadas y 1 omitida. Ahora son 129 aprobadas: 124 + 4 pruebas nuevas del
catálogo + 1 prueba que antes se omitía. Esa prueba exige los roles `anon` y `authenticated`. Se ejecuta ahora porque
creé esos roles de simulación en mi clúster local desechable (no en Supabase). **Es una diferencia del entorno, no un
cambio de código**: en CI y en el proyecto real la prueba depende de que esos roles existan.

Pruebas nuevas de `test_tenant_discovery.py` (4):

- Los nueve nombres están y ninguno está verificado ni tiene identificador oficial.
- RLS activa y cero políticas.
- `portal_app` no puede leer el catálogo (SQLSTATE 42501).
- Un nombre observado igual al de una empresa del portal no concede acceso.

## 5. Dry-run remoto

`supabase db push --linked --dry-run` (ejecutado): lista **`20261112000000_client_scope.sql`** y
**`20261112000100_tenant_discovery_reconcile.sql`** como pendientes. No aplicó nada.

## 6. Comandos que requieren autorización explícita

| Orden | Comando | Efecto |
|---|---|---|
| 1 | `supabase db push --linked` | Aplica `20261112000000` y `20261112000100` en el proyecto remoto. Irreversible en la práctica para la parte de datos. |
| 2 | Ejecutar `docs/sql/fase-12c1-verificacion-solo-lectura.sql` en el SQL Editor | Solo lectura. Confirma tras la aplicación: 14 políticas, 9 filas, historial de tres versiones. |

**Antes del orden 1**, el propietario debe revisar el dry-run y confirmar que la estructura remota no ha cambiado desde la
auditoría. Si la migración de reconciliación detecta una diferencia, la aplicación se detiene sin modificar nada.

**No ejecutar:** `supabase migration repair`, `supabase db reset`, `seed.sql`, ni cualquier escritura manual sobre
`logixtic_tenant_discovery`.

## 7. Pendientes independientes (no bloquean esta reconciliación)

- Creación y validación de `portal_api` (en remoto no está probado; la URL de la base no resuelve).
- Conexión real del Session Pooler.
- Configuración de Supabase Auth: el registro público sigue activo.
- Identificadores oficiales de los tenants: ninguno verificado.
- Contrato de integración con el SaaS de Logixtic: no encontrado en los repositorios revisados.

Ninguno de ellos se ha resuelto ni se ha simulado. No se inicia la sincronización de datos operativos ni se activa Logix.
