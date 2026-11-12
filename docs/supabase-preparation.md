# Preparación para Supabase

**Estado:** la base de datos y la verificación de tokens están preparadas y probadas contra PostgreSQL local.
**No hay ningún proyecto de Supabase configurado**, ni credenciales, ni migraciones aplicadas en remoto. Todo lo
que sigue se ejecuta solo con autorización del responsable del proyecto.

## 0. Fuente canónica de migraciones (fase 08C)

El esquema se gestiona desde **`supabase/migrations/`** con Supabase CLI. `supabase/config.toml` y
`supabase/seed.sql` (solo datos sintéticos, solo bases desechables) completan la configuración.

Las migraciones Alembic de `apps/api/migrations/` se conservan como referencia histórica. Procedimiento de
instalación nueva, transición de bases con `alembic_version` y reversión: `docs/database-migration-strategy.md`.

Estado: los archivos SQL están generados y revisados, pero **no se han aplicado** a ninguna base todavía.

## 1. Qué está listo

| Pieza | Dónde | Estado |
|---|---|---|
| Esquema con claves compuestas y restricciones multi-tenant | `apps/api/migrations/versions/0001_foundation.py` | Aplicado en PostgreSQL 18 local. Pruebas de integración. |
| Endurecimiento de privilegios para `anon` y `authenticated` | `apps/api/migrations/versions/0002_supabase_grants_hardening.py` | Aplicado en local. Prueba de regresión. |
| Rol de aplicación sin `BYPASSRLS` | Migración 0001 (`portal_app`) | Probado: la API ejecuta como ese rol. |
| Políticas RLS en 8 tablas | Migración 0001 | Probadas con usuarios de dos empresas. |
| Verificación de JWT de Supabase | `apps/api/app/core/security.py` | Probada con tokens sintéticos. Sin proyecto real. |
| Referencia a `auth.users` | Migración 0001, condicional a que exista el esquema `auth` | Se aplica al migrar en Supabase. |

## 2. Diseño de identidad y aislamiento

- `profiles.id` es el mismo `sub` del JWT de Supabase Auth. En Supabase se vincula a `auth.users` con clave
  foránea y borrado en cascada.
- `tenant_memberships` es la **única** fuente de empresa y de rol. El servidor la lee bajo RLS.
- Las políticas RLS dependen de `app.current_user_id`, que FastAPI fija con `set_config` dentro de cada
  transacción (`SET LOCAL`). No se filtra entre peticiones que compartan conexión del pool.
- `portal_my_tenant_ids()` es `SECURITY DEFINER` para evitar recursión de RLS sobre `tenant_memberships`.
  Solo devuelve empresas del usuario indicado en la sesión.

## 3. Privilegios en Supabase (migración 0002)

Supabase expone el esquema `public` a través de PostgREST con los roles `anon` (sin sesión) y
`authenticated` (con sesión). Por defecto, esos roles reciben privilegios sobre las tablas y funciones nuevas.

- La migración revoca **todo** privilegio de tabla a `anon` y `authenticated` sobre las 8 tablas del portal.
- Retira `EXECUTE` de `PUBLIC` sobre las funciones del portal y lo concede solo a `portal_app`.
- Las sentencias son condicionales: si los roles no existen, no hacen nada.
- **No toca `service_role`.** Ver la sección 5.

Resultado: un cliente que llame a PostgREST directamente no recibe filas ni puede ejecutar funciones del portal.
La única vía de acceso es la API.

## 4. Verificación de tokens: qué comprobar en el proyecto real

La API admite dos modos. Configure **uno**. La API no rechaza la configuración si se indican los dos: en ese caso usa JWKS e ignora el secreto.

| Modo | Variable | Cuándo usarlo |
|---|---|---|
| Clave pública (RS256 o ES256) | `SUPABASE_JWKS_URL` | Si el proyecto firma con claves asimétricas. |
| Secreto compartido (HS256) | `SUPABASE_JWT_SECRET` | Si el proyecto usa el secreto JWT heredado. |

Antes de elegir, confirme en el panel del proyecto qué tipo de firma usa. Esta fase **no** verificó ese
punto contra un proyecto real.

Además de la firma, la API exige:

- `iss` igual a `<SUPABASE_URL>/auth/v1`.
- `aud` igual a `SUPABASE_JWT_AUDIENCE` (por defecto `authenticated`).
- `role` igual a `authenticated`. Un token anónimo se rechaza.
- `exp` presente y no vencido, con un margen de `JWT_LEEWAY_SECONDS` (30 s por defecto, máximo 120 s).

## 5. Decisiones pendientes

| Decisión | Recomendación | Motivo |
|---|---|---|
| Rol con el que la API se conecta | Un rol de servicio propio, sin `BYPASSRLS`, que pueda hacer `SET ROLE portal_app` | El rol `postgres` de Supabase suele tener `BYPASSRLS` (verificar en el proyecto). La API debe usar un rol propio y reservar `postgres` para migraciones. |
| Uso de `service_role` | **No** usarlo en la API ni en el frontend | Tiene `BYPASSRLS` y ignora la RLS. Si se usa, el aislamiento depende solo del código. |
| Conexión desde la API | Pooler en modo transacción | Las variables `SET LOCAL` duran una transacción; el modo sesión no es necesario. Confirmar compatibilidad con el pooler elegido. |
| Migraciones en remoto | Aplicar primero en un proyecto de prueba, con revisión | Las migraciones son irreversibles en la práctica (la 0002 no restaura privilegios). |
| Storage (adjuntos) | Buckets privados y URLs firmadas generadas por FastAPI | No implementado todavía. |

## 6. Pasos para configurar Supabase (orden sugerido)

Ejecutar solo con autorización. Ningún paso necesita credenciales de producción de Logixtic.

1. **Crear un proyecto de prueba** en Supabase (no el de producción de Logixtic).
2. **Configurar Auth**: correo y contraseña. Definir política de contraseñas y confirmación de correo.
3. **Obtener la configuración**: URL del proyecto, tipo de firma JWT (JWKS o secreto) y cadena de conexión
   del rol de servicio. Guardarla en un `.env` local de la API (no versionado, ver `apps/api/.env.example`).
4. **Crear el rol de servicio** de la API sin `BYPASSRLS` y conceder membresía en `portal_app`. Sin esta
   concesión, cada petición falla con `permission denied to set role`. La migración `0001` solo la concede al rol
   que la ejecuta, y el nombre del rol de la API depende de cada proyecto, así que el paso va fuera de las migraciones:
   ```sql
   -- Ejecutar una vez, como postgres, en el proyecto de desarrollo (reemplazar el nombre del rol):
   CREATE ROLE portal_api LOGIN NOBYPASSRLS PASSWORD '<generar fuera del repositorio>';
   GRANT portal_app TO portal_api;
   ```
   La contraseña se genera y se guarda fuera del repositorio. Nunca se escribe en un archivo versionado.
5. **Aplicar las migraciones** (`alembic upgrade head`) contra el proyecto de prueba. Comprobar:
   - Que `portal_app` existe y no tiene `BYPASSRLS`.
   - Que `anon` y `authenticated` no tienen privilegios sobre las tablas del portal.
6. **Aprovisionar empresas, perfiles y membresías** con un proceso controlado (no existe API de alta).
   Para pruebas, usar solo datos sintéticos: dominios `.test`, nombres ficticios y NIT de ejemplo.
7. **Crear un usuario de prueba** por Supabase Auth, iniciar sesión y obtener un token real.
8. **Probar la API** con ese token: `/me`, operaciones, eventos y comentarios. Probar también un token de
   otra empresa y comprobar que recibe 404.
9. **Ejecutar la suite de integración** contra el proyecto de prueba con `PORTAL_TEST_DATABASE_URL`.
   Nunca apuntar las pruebas a un proyecto con datos reales.

## 7. Migración de cuentas locales (no migrar contraseñas)

Hoy: `apps/web/local/auth/users.json` (cuentas, ignorado por Git) y `sessions.json`.

1. Exportar cuentas **sin** `passwordHash`: id, nombre, correo normalizado, empresa, rol, estado y versión de términos.
2. Crear las cuentas en Supabase Auth con invitación o restablecimiento. **No se migran hashes**: cada persona
   fija su credencial en el sistema definitivo.
3. Insertar `profiles` con el mismo identificador que `auth.users` y una membresía activa en `tenant_memberships`.
4. Conservar la versión de términos aceptada en `profiles.terms_version_accepted`.
5. No migrar sesiones: caducan.

Interfaces que deben sustituirse sin reconstruir las páginas: `AuthService`, `UserRepository`,
`SessionService` y `TenantMembershipRepository` (`apps/web/src/services/auth/contracts.ts`).

## 7b. Frontend: módulos preparados (no conectados a las pantallas)

| Módulo | Qué hace | Estado |
|---|---|---|
| `apps/web/src/services/auth/supabase-config.ts` | Lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Exige https (http solo en loopback). **Rechaza** `sb_secret_*` y JWT con rol `service_role`. | Probado |
| `supabase-session.ts` | Inicio y cierre de sesión, token de acceso vigente, restablecimiento de contraseña (respuesta igual exista o no la cuenta), cambio de contraseña, suscripción a cambios. Errores reducidos a `ok`, `invalid` o `unavailable`. | Probado con cliente sintético |
| `supabase-client.ts` | Crea el cliente con PKCE y renovación automática. Carga el SDK solo si hay configuración válida. | Compilado; no ejecutado contra un proyecto real |
| `membership.ts` | Decide empresa única, elección obligatoria o elección inválida a partir de `/me`. El servidor sigue siendo la autoridad. | Probado |
| `HttpPortalRepository` | Recibe `getToken` y envía el token de Supabase. Sin sesión, no hay petición. | Probado con respuestas sintéticas |

**Lo que falta para conectar** (no hecho en esta fase):

1. Sustituir en `login-page`, `recovery-pages` y `use-end-session` la llamada al JSON local por el servicio de Supabase cuando el modo sea `supabase`.
2. Protección de rutas: la guarda de `router.tsx` debe comprobar la sesión de Supabase en ese modo, no `sessionStorage`.
3. Crear la sesión de la aplicación con la empresa que devuelve `/me` (con `membership.ts` si hay varias).
4. Pantallas de operaciones que consuman `listOperationSummaries` y `getOperationSummary`, con estado de información no disponible para los campos que la API no tiene.
5. Revisión visual, E2E y verificación del modo JSON local, que debe seguir funcionando sin Supabase.

**Variables de entorno del frontend:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (públicas por diseño), `VITE_API_BASE_URL`. Nunca `service_role`.

## 8. Qué falta antes de usuarios reales

1. Proyecto de Supabase configurado y migraciones aplicadas tras revisión.
2. Proceso de sincronización con Logixtic para `operation_refs` y `operation_events` (ver `fastapi-integration.md`, sección 6).
3. Proceso de aprovisionamiento de empresas y perfiles.
4. Endpoints de solicitudes, adjuntos y documentos, con sus pruebas de autorización.
5. Implementar en el frontend la sesión de Supabase y su renovación, y conectar `HttpPortalRepository`.
6. Revisión de seguridad de las políticas RLS y de la configuración de Supabase.
