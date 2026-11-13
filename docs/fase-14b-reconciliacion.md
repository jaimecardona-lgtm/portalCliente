# Fase 14B · Plan de reconciliación del remoto (sin ejecutar)

**Estado al cierre de esta vuelta:** ningún cambio remoto. Ninguna migración aplicada, ningún `migration repair`,
ningún QA aprovisionado. El desfase no está resuelto.

## 1. Hechos verificados hoy (solo lectura)

| Hecho | Fuente |
|---|---|
| Historial remoto: `20261111000000`, `20261111000100` | `supabase migration list --linked` |
| Pendientes según la CLI: `…112000000`, `…112000100`, `…112000200`, `…112000300`, `…112000400` | `supabase db push --linked --dry-run` |
| Existen en remoto `client_accounts`, `client_memberships`, `client_documents`, `client_document_events`, `storage_cleanup_jobs`, `sync_runs` | `supabase inspect db table-stats --linked` |
| Existen en remoto `platform_staff`, `staff_access_audit`, `staff_role_permissions`, `staff_tenant_grants` | Ídem |
| `staff_role_permissions` tiene **11 filas** (la matriz exacta de la migración `…400`) | Recuento estimado |
| `platform_staff` tiene **0 filas**: ningún QA aprovisionado | Recuento estimado |
| `profiles` y `tenants` tienen **0 filas** estimadas | Recuento estimado |
| `logixtic_tenant_discovery` tiene **9 filas** estimadas (nombres observados) | Recuento estimado |
| `DATABASE_URL`: usuario `portal_api`, puerto 5432, `sslmode` presente, contraseña presente (no mostrada) | Inspección sin valores |
| El host de `DATABASE_URL` **no resuelve** por DNS y **no termina** en el dominio de Supabase | Resolución DNS |

**Conclusión:** las migraciones `…000` a `…400` están, al menos parcialmente, aplicadas en remoto sin registro en el
historial. La equivalencia exacta de columnas, restricciones, índices, políticas y privilegios **no está confirmada**:
la CLI no la muestra y el volcado requiere Docker.

## 2. Qué hace falta para decidir

1. **Salida de `docs/sql/fase-13-estado-remoto-solo-lectura.sql`** ejecutada por el propietario en el SQL Editor.
   Contiene objetos, columnas, restricciones, índices, RLS, políticas, privilegios, recuentos y objetos no versionados.
2. **Host del Session Pooler** copiado del panel de Supabase (Connect). No lo reconstruyo a partir de la región.
3. **UUID de la cuenta del propietario** para el aprovisionamiento. Se pasa en la conversación, no en archivos.

## 3. Opciones de reconciliación (según el resultado del punto 2)

| Caso | Acción | Requiere |
|---|---|---|
| El remoto coincide **exactamente** con los archivos de las cinco migraciones | Registrar el historial con `supabase migration repair --status applied <versión>` para cada una, solo tras comparar la estructura | Autorización explícita |
| Hay diferencias o objetos no versionados | Migración correctiva nueva. Sin `DROP` de objetos con datos. Las filas existentes (9 nombres, 11 permisos) se conservan | Autorización explícita y copia previa |
| Falta alguna tabla o columna | Migración nueva que la añada, con comprobaciones que fallen si la estructura previa no coincide | Autorización explícita |

**No se hará:** `db push` sin dry-run revisado, `db reset`, `seed.sql`, ni borrado de objetos con datos.

## 4. Orden de la siguiente vuelta, cuando haya datos

1. Comparar la salida de la consulta con las migraciones locales. Registrar las diferencias.
2. Proponer la opción de la sección 3 y pedir autorización escrita.
3. Con autorización: ejecutar la reconciliación elegida y la validación de `docs/sql/fase-12c3-validacion-posterior.sql`.
4. Comprobar la conexión: `scripts/check_db_role.py` con la cadena del Session Pooler.
5. Aprovisionar el QA con `provision_staff.py` (UUID, referencia de autorización, nombre), y verificar `/api/v1/staff/me`.
6. Probar `/soporte` con una sesión real y registrar cada paso de la lista de validación de la fase 14B.

## 5. Bloqueos exactos

- Host del Session Pooler: pendiente del propietario.
- Salida de la consulta de estado remoto: pendiente del propietario.
- UUID de la cuenta: pendiente del propietario.
- Autorización para registrar historial o aplicar cambios: pendiente del propietario.
- Registro público de Auth: sigue activo (comprobado en la fase 14). Lo desactiva el propietario en el panel.
- Verificación oficial de tenants: ningún tenant tiene `external_tenant_id`; el panel de soporte no mostrará empresas hasta que se verifiquen con sus identificadores oficiales.

## 6. Auditoría de solo lectura del 12/11/2026 (resultado)

Ejecutada con la conexión configurada en `apps/api/.env` (usuario administrador a través del pooler). Solo `SELECT`.
Salida guardada fuera del repositorio.

**Coincide con las cinco migraciones pendientes (por nombre y estructura):**

| Elemento | Resultado |
|---|---|
| Tablas `client_accounts`, `client_memberships`, `client_documents`, `client_document_events`, `storage_cleanup_jobs`, `sync_runs`, `platform_staff`, `staff_tenant_grants`, `staff_access_audit`, `staff_role_permissions` | Existen |
| Columnas nuevas de `tenants` (`external_tenant_id`, `verified_at`, `verified_by`) y restricciones asociadas | Existen |
| Columnas nuevas de `operation_refs` (`client_account_id`, `source_*`, `sync_run_id`) | Existen |
| `client_documents.operation_id` admite NULL | Sí (migración `…300` aplicada en estructura) |
| Índices de las tablas nuevas (nombres y definiciones) | Coinciden |
| RLS activa en todas las tablas nuevas | Sí |
| Políticas RLS | 26, con los nombres exactos de las migraciones |
| Funciones de contexto (`portal_current_staff_role`, `portal_staff_scope_tenant_ids`, etc.) | Existen |
| Matriz `staff_role_permissions` | 11 filas, igual que la migración |
| Privilegios de `portal_app` sobre las tablas nuevas | Coinciden (sin privilegios para anon, authenticated ni PUBLIC) |
| `portal_app` | Sin LOGIN, sin BYPASSRLS |
| Recuentos | `logixtic_tenant_discovery` 9; el resto 0; `platform_staff` 0; `profiles` 0; `tenants` 0 |

**Lo que no se ha comparado todavía:** el cuerpo de las funciones y el texto completo de cada expresión de política y de
cada CHECK. La igualdad es fuerte por nombres y estructura, pero no es prueba textual completa.

**Falta:** el rol `portal_api`. Solo existe `portal_app`.

**Conexión:** `DATABASE_URL` resuelve y conecta, pero usa el usuario administrador (`postgres.<ref>`), sin `sslmode`.
No debe quedar como credencial de la API.

**Decisión pendiente del propietario:** registrar el historial de las cinco versiones con `supabase migration repair --status applied`
(opción A del plan, si acepta la equivalencia estructural) o comparar también el texto de funciones y políticas antes de decidir.
Ninguna de las dos se ejecuta sin autorización escrita.

## 7. Comparación estructural completa (huella del catálogo, solo lectura)

Se generó la misma huella en la base local migrada con las siete migraciones y en el remoto: tablas y RLS, columnas
(tipo, nulidad y default), restricciones, índices, políticas (comando, roles, expresiones USING y WITH CHECK), funciones
(argumentos, SECURITY DEFINER, `search_path` y cuerpo), privilegios de tablas, roles, membresías y matriz de permisos.

Resultado: **idénticas**, salvo estas tres diferencias esperadas:

1. `profiles_auth_user_fk`: existe solo en remoto. La migración la añade de forma condicional y la base local no tiene
   el esquema `auth`.
2. El rol `portal_api` existe solo en remoto, con membresía en `portal_app`.
3. La membresía de `postgres` en `portal_app` aparece en remoto y no en local, por la misma razón que el rol anterior.

Las restricciones `NOT NULL` se excluyeron de la comparación porque PostgreSQL 18 (local) las guarda en `pg_constraint`
y PostgreSQL 17 (remoto) no. La nulidad de cada columna sí se compara.

Conclusión: la equivalencia estructural de las cinco migraciones pendientes está verificada. Falta solo la decisión
escrita sobre el registro del historial.

## 8. Configuración de portal_api

`apps/api/scripts/configure_portal_api_url.py` pide la contraseña de `portal_api` con entrada oculta, construye la URL en
memoria, la escribe en `.env` de forma atómica y conserva la conexión del propietario como `OWNER_DATABASE_URL`.
Se ejecuta en el terminal del responsable, no en un chat.
