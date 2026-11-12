# Fase 12C.3 · Plan de aplicación remota (preparado, NO ejecutado)

**Estado:** consolidación local completa. Dry-run ejecutado. **No se ha aplicado nada en remoto.**

## 1. Estado Git

Rama `feat/supabase-auth-integration`. Commits locales creados en esta fase (sin push, sin merge):

| Commit | Contenido |
|---|---|
| `8314249` | chore(config): exclusiones de credenciales y configuración de Logix |
| `2422ece` | feat(auth): login, recuperación y guarda de rutas con Supabase |
| `6da8b1f` | feat(api): nivel B de cliente final y preflight del rol de conexión |
| `8f7d55d` | feat(db): migraciones de cliente final y reconciliación del catálogo |
| `771105d` | docs: arquitectura, mapa de datos y reconciliación |

Base: `67130db`. El árbol de trabajo queda limpio. **El bloqueo de commits de fases anteriores no se repitió:** los commits se
crearon con normalidad. Si el entorno vuelve a bloquearlos, la causa se documentará en vez de eludirla.

## 2. Revisión de secretos

- Escaneo de los 191 archivos rastreados o preparables: **ningún valor real** de clave, JWT, contraseña de base ni clave privada.
- `.env` de la API (`apps/api/.env`), `.env.local` del frontend y `.env` raíz: **ignorados** por Git.
- Único `.env` rastreado: `apps/api/.env.example` (plantilla con valores vacíos o desactivados).
- Coincidencias de "URL con contraseña" revisadas: son marcadores (`<ref>`, `<rol>`) y la contraseña **efímera de CI** ya
  versionada en `.github/workflows/verify.yml` desde fases anteriores (base descartable de GitHub Actions). No es una
  credencial de producción. Se mantiene sin cambios.

## 3. Revisión de las migraciones pendientes

| Criterio | `20261112000000_client_scope` | `20261112000100_tenant_discovery_reconcile` |
|---|---|---|
| No pierde registros | Solo añade tablas y columnas nulas. No borra ni actualiza filas. | Verifica la tabla existente y no la recrea. Inserta nombres con `ON CONFLICT DO NOTHING`. |
| Nueve nombres preservados | No aplica | Sí: se comprueba que existen y no se modifican. |
| Ningún tenant ficticio activo | No crea tenants ni membresías. | No cambia ninguna fila. Cero verificados. |
| Autorización por tenant y cliente final | Operaciones, eventos, comentarios, solicitudes y adjuntos exigen cliente asignado y membresía activa de tenant. | No aplica (catálogo sin acceso). |
| RLS en tablas nuevas | Activa en `client_accounts`, `client_memberships` y `sync_runs`. | Activa; cero políticas. |
| Sin privilegios adicionales a anon, authenticated, PUBLIC | Revoca a los tres. `portal_app` solo lectura en las dos tablas de cliente. | Revoca a los cuatro y lo verifica al final. |
| Historial no modificado | Sí | Sí |

**Hallazgo de la revisión:** las pruebas cubren aislamiento entre clientes, comentarios y catálogo. Falta una prueba
específica de que un código o nombre externo de tenant no concede acceso. Está registrado como pendiente en
`docs/fase-12c1-reconciliacion.md`.

## 4. Dry-run

Ejecutado: `supabase db push --linked --dry-run`. Proyecto vinculado: `fjfnuttziwhxbjhkdtmk` (coincide con el indicado).

Historial local frente a remoto:

| Versión | Local | Remoto |
|---|---|---|
| 20261111000000 | Sí | Sí |
| 20261111000100 | Sí | Sí |
| 20261112000000 | Sí | **Pendiente** |
| 20261112000100 | Sí | **Pendiente** |

Salida del dry-run: "Would push these migrations: `20261112000000_client_scope.sql`, `20261112000100_tenant_discovery_reconcile.sql`".
No hay migraciones inesperadas.

## 5. Copia recuperable antes de cualquier escritura

Estado: **pendiente de ejecución por el propietario.** No puedo hacerla desde aquí:

- `supabase db dump` requiere Docker Desktop, que no está en ejecución.
- La API REST no expone la tabla al rol anónimo (401), por diseño.

Procedimiento propuesto, en el SQL Editor como propietario, solo lectura:

```sql
-- Copia del catálogo (9 filas, nombres observados; sin identificadores oficiales).
SELECT id, source_system, observed_label, external_tenant_id, verification_status,
       first_observed_at, verified_at
FROM public.logixtic_tenant_discovery
ORDER BY observed_label;
```

Guardar el resultado fuera del repositorio. Además, la definición exacta está en
`docs/sql/historico/logixtic_tenant_discovery_manual_original.sql`, y la migración de reconciliación reproduce esa
estructura. Confirmar también los recuentos de tablas operativas (consulta 8 del archivo de la fase 12C.1): deben ser 0.

## 6. Plan de recuperación

| Escenario | Qué ocurre | Recuperación |
|---|---|---|
| Falla `20261112000000` | Ninguna migración nueva queda registrada. Se revisa el error. | No reintentar a ciegas. Diagnosticar y corregir en local. |
| Falla `20261112000100` tras aplicarse `20261112000000` | La estructura de cliente existe y el catálogo no se ha tocado (la verificación ocurre antes de cualquier escritura). | Corregir la incompatibilidad. Si es necesario retirar la estructura de cliente, usar `supabase/rollback/20261112000000_client_scope.down.sql` **con autorización**. Verificar antes que no hay filas de cliente. |
| Discrepancia del catálogo con la auditoría | La migración se detiene con mensaje claro. No modifica nada. | Comparar la estructura con `docs/sql/historico/`. |
| Pérdida de registros del catálogo | Imposible con estas migraciones (no hay DELETE ni UPDATE). | Restaurar desde la copia de la sección 5. |
| Problemas tras aplicar | Las reversiones están listas. | Reversión manual y controlada con autorización. Nunca `db reset`. |

Notas:
- La reversión de `client_scope` elimina `client_accounts`, `client_memberships`, `sync_runs` y las columnas nuevas de
  `operation_refs`. Es segura solo si esas tablas no tienen datos reales. Por eso debe confirmarse con la validación previa.
- La reversión de `tenant_discovery_reconcile` es **vacía a propósito**: no borra el catálogo.

## 7. Comandos que requieren autorización explícita

| Orden | Comando | Efecto | Estado |
|---|---|---|---|
| 1 | Copia del catálogo (sección 5) | Solo lectura | Lo ejecuta el propietario |
| 2 | `supabase db push --linked` | Aplica las dos migraciones pendientes | **Requiere autorización** |
| 3 | `docs/sql/fase-12c3-validacion-posterior.sql` en el SQL Editor | Solo lectura | Ejecutar tras el orden 2 |

**Prohibidos en este proyecto:** `supabase migration repair`, `supabase db reset`, `seed.sql`, y cualquier escritura manual
sobre `logixtic_tenant_discovery` o las tablas de cliente.

## 8. Validación posterior prevista

`docs/sql/fase-12c3-validacion-posterior.sql` cubre las 10 comprobaciones pedidas: versiones registradas, existencia de
`client_accounts`, `client_memberships` y `sync_runs`, claves foráneas compuestas, integridad de membresías, políticas
RLS (esperado: **14**), nueve registros conservados, cero verificados y sin identificador oficial, acceso denegado al
catálogo desde `portal_app`, `anon` y `authenticated`, y atributos de roles.

## 9. Pendientes independientes (no bloquean la aplicación)

- `portal_api`: no creado ni verificado. La URL de la base no resuelve.
- Session Pooler real: pendiente.
- Supabase Auth: el registro público sigue activo. Lo cambia el propietario en el panel.
- Identificadores oficiales de tenants: ninguno verificado.
- Contrato de integración con el SaaS de Logixtic: no encontrado en los repositorios revisados.
- Logix y OpenRouter: sin activar.
