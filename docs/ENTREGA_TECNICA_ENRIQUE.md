# Entrega técnica — Logixtic Client Portal (v0.1.0-alpha.1)

**Para:** equipo de desarrollo de Enrique (continuación de integraciones e implementación empresarial).
**Repositorio:** `jaimecardona-lgtm/portalCliente` · rama de trabajo `feat/client-portal-v1`.
**Estado en una frase:** interfaz funcional y verificada con datos sintéticos, con autenticación **solo de desarrollo**. **No hay backend, ni autenticación real, ni integración con Logixtic. No debe usarse con clientes reales hasta cumplir la sección 11.**

Esta es la referencia principal de transferencia. Complementan este documento `docs/architecture.md`, `docs/fastapi-integration.md`, `docs/supabase-preparation.md`, `docs/autenticacion-local.md` y `docs/validation.md`.

---

## 1. Objetivo del sistema

Portal B2B donde las empresas clientes de Logixtic consultan sus operaciones logísticas (DO), el seguimiento por evento, sus documentos, cotizaciones y solicitudes, y se comunican con su equipo de operaciones mediante conversaciones ligadas a cada evento.

Objetivos de la versión actual:

- Validar la experiencia y la arquitectura del frontend antes de conectar los sistemas reales.
- Dejar contratos claros para FastAPI, Supabase y la integración con Logixtic.
- Ofrecer un entorno de revisión donde cualquier persona del equipo pueda crear una cuenta y recorrer el portal.

## 2. Arquitectura actual

Detalle en `docs/architecture.md`. Resumen:

```text
Navegador: páginas (src/features) → repositorio (PortalRepository) → datos locales sintéticos
                                  → cliente de autenticación local → /__local-auth (solo dev)

Servidor de desarrollo (solo `vite dev`): scripts/lib/local-auth → JSON en apps/web/local/auth/

Futuro: Supabase Auth + PostgreSQL, FastAPI, Supabase Storage, Logixtic.
```

Puntos clave:

- **Un único contrato de datos**, `PortalRepository`. Las pantallas no conocen si los datos son locales o remotos.
- **Dos modos explícitos**: `local` (solo desarrollo) y `blocked` (producción). La decisión está en `src/config/runtime.ts`.
- **Código de desarrollo fuera de producción**: el compilador elimina fixtures, repositorio local, autenticación local, selector de empresa de QA y motor de Logix. Se comprueba con `npm run build:verify`.
- **Guarda de acceso** en `beforeLoad` del layout autenticado (`src/routes/router.tsx`).

## 3. Componentes implementados

| Módulo | Ruta(s) | Estado |
|---|---|---|
| Acceso: login, registro, recuperación, perfil | `/login`, `/registro`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/perfil` | Implementado. Solo desarrollo. Producción bloqueada. |
| Textos legales | `/terminos`, `/privacidad` | Borrador estructurado, pendiente de aprobación jurídica |
| Torre de control | `/` | Implementada, con datos sintéticos |
| Operaciones y detalle DO | `/operaciones`, `/operaciones/:id` | Implementadas. Timeline y conversaciones por evento. |
| Información de la empresa | `/cuenta` | Implementada (solo lectura) |
| Gestión documental | `/documentos` | Implementada. Carga y vista previa solo en desarrollo. |
| Cotizaciones | `/cotizaciones`, `/cotizaciones/:id` | Implementadas. Decisión solo en desarrollo. |
| Solicitudes | `/solicitudes`, `/solicitudes/nueva` | Implementadas. Envío solo en desarrollo. |
| Asistente Logix | Panel en la shell | Motor de reglas solo en desarrollo. En producción, lanzador deshabilitado. |
| Marketplace | `/marketplace` | Vista futura. Oculta en producción. |

## 4. Funcionalidades de desarrollo local

Solo existen en `vite dev`. **No están en el build de producción.**

- Registro e inicio de sesión con cuentas creadas en el navegador. Las cuentas se guardan en `apps/web/local/auth/users.json`, con contraseñas en hash scrypt.
- Recuperación de contraseña con enlace local de 15 minutos, consultable desde la bandeja de localhost.
- Repositorio con datos sintéticos (empresas, operaciones, eventos, comentarios, documentos, cotizaciones y solicitudes).
- Selector de empresa de QA ("Entorno local") para revisar el aislamiento entre empresas.
- Escrituras en memoria (decisiones, solicitudes, versiones documentales, comentarios): se pierden al recargar y no generan efecto en ningún sistema.
- Motor de reglas de Logix sobre los datos locales. No es un modelo de lenguaje.

## 5. Funcionalidades pendientes (requieren backend)

- Autenticación real y renovación de sesión (Supabase Auth).
- Lectura de operaciones, eventos, comentarios, documentos, cotizaciones, solicitudes y empresa desde FastAPI.
- Persistencia de comentarios, solicitudes, decisiones de cotización y versiones documentales, con auditoría.
- Decisiones de cotización con efecto comercial.
- Subida, almacenamiento y vista previa de adjuntos y documentos.
- Recuperación de contraseña por correo real.
- Servicio de consulta de Logix con controles de autorización.
- Marketplace (funcionalidad futura).

## 6. Dependencias técnicas

| Área | Tecnología | Versión instalada |
|---|---|---|
| Build | Vite | 8.3.8 |
| Lenguaje | TypeScript estricto | 7.0.2 |
| UI | React | 19.3.1 |
| Rutas | TanStack Router (definición por código) | 1.170.46 |
| Datos en cliente | TanStack Query | 5.107.1 |
| Estilos | Tailwind CSS v4 | 4.3.5 |
| Iconos | lucide-react | 1.72.0 |
| Formularios | React Hook Form + Zod | 7.92.0 / 4.6.7 |
| Tipografía | Inter autohospedada | 5.x |
| Pruebas | Vitest 5.1.0, Testing Library, jsdom, Playwright Test 1.65.x | |

Versiones exactas en `apps/web/package-lock.json`. Versiones mínimas: Node 22, npm 10.

## 7. Integraciones futuras

| Integración | Estado | Notas |
|---|---|---|
| Supabase Auth | Preparado en la API (verificación de JWT, probada con tokens sintéticos). Pendiente en el frontend y sin proyecto. | Correo y contraseña; recuperación por correo. |
| Supabase PostgreSQL | Preparado. Migraciones 0001 y 0002 probadas en PostgreSQL 18 local. Sin proyecto Supabase. | Ver sección 17 y `docs/supabase-preparation.md`. |
| Supabase Storage | Pendiente | Adjuntos y documentos con URLs firmadas. |
| FastAPI (`apps/api`) | Implementado en local: 7 rutas bajo /api/v1, pruebas de aislamiento. No desplegado. | Ver sección 11 y `docs/fastapi-integration.md`. |
| Adaptador HTTP en el frontend (`apps/web/src/services/api/`) | Implementado y probado con respuestas sintéticas. **No conectado a las pantallas.** | El repositorio mock sigue activo. |
| Logixtic (operaciones, eventos, documentos oficiales, cotizaciones) | Pendiente | Sin conexión. Fuente de verdad y sincronización a definir. |

No hay ninguna integración en producción. Ningún texto de la interfaz debe afirmar lo contrario.

## 8. Consideraciones de seguridad

- **Autenticación de desarrollo**: no es seguridad. Solo acepta conexiones de localhost. Sus límites están en `docs/autenticacion-local.md`.
- **Aislamiento por tenant en el frontend**: es de presentación. La autorización real debe aplicarla FastAPI en cada acceso.
- **Producción**: `npm run build` falla sin `VITE_AUTH_PROVIDER` y `VITE_API_BASE_URL`. Aun configurados, el acceso queda bloqueado porque el proveedor no está implementado.
- **Sesiones**: la sesión del navegador no concede acceso por sí sola. La cookie la valida el servidor.
- **Datos**: no se usan datos reales de clientes. Los datos locales de autenticación están fuera de Git.
- **Repositorio público**: no subir credenciales, cuentas, capturas con información privada ni archivos confidenciales. Ver `CONTRIBUTING.md`.
- **Textos legales**: borradores. Razón social, NIT, dirección, plazos y canales aparecen como pendientes en `src/content/legal/legal-meta.json`.

## 9. Flujo de desarrollo

1. Crear una rama desde `main` o desde la rama de hito. Convenciones en `CONTRIBUTING.md`.
2. Trabajar con `npm run dev` en `apps/web`.
3. Antes de confirmar: `npm run typecheck`, `npm test`, y según el cambio, `npm run build:verify`, `npm run test:e2e` y `npm run test:e2e:prod`.
4. Commits en Conventional Commits, con cuerpo que explique el porqué.
5. Documentación actualizada en el mismo cambio cuando cambie un contrato, una ruta o un flujo.

## 10. Plan de migración a Supabase

Detalle en `docs/supabase-preparation.md`. Secuencia propuesta:

1. Crear el proyecto de Supabase y configurar Auth (correo y contraseña, políticas, confirmación).
2. Diseñar y revisar las migraciones de `profiles`, `tenants` y `tenant_memberships`.
3. Migrar perfiles y membresías del JSON. **Las contraseñas no se migran**: cada persona establece la suya en Supabase Auth mediante invitación o restablecimiento.
4. Definir las tablas del dominio (operaciones, eventos, comentarios, documentos, cotizaciones, solicitudes, adjuntos), todas con `tenant_id`.
5. Definir políticas de Row Level Security junto con las reglas de FastAPI, y probarlas con usuarios de cada tenant.
6. Sustituir `AuthService`, `UserRepository`, `SessionService` y `TenantMembershipRepository` (contratos en `src/services/auth/contracts.ts`) por las implementaciones reales.

## 11. Plan de integración con FastAPI

Detalle en `docs/fastapi-integration.md`. Secuencia propuesta:

Estado actual:

1. **Hecho:** verificación de token de Supabase y resolución de la membresía activa en cada petición (`apps/api`).
2. **Hecho:** endpoints de lectura de empresa, operaciones, eventos y comentarios, y creación de comentarios y respuestas, con pruebas de aislamiento por empresa y de RLS.
3. **Hecho:** `HttpPortalRepository` (`apps/web/src/services/api/`) con pruebas y sin conectar.
4. **Pendiente:** cubrir la brecha de datos de operaciones y empresa (`docs/fastapi-integration.md`, sección 6) antes de conectar las pantallas.
5. **Pendiente:** endpoints de solicitudes, adjuntos, documentos, cotizaciones y Logix.
6. **Pendiente:** cargar el repositorio remoto en `loadRemoteRepository` solo cuando haya sesión real de Supabase.

Los endpoints implementados están listados en `docs/fastapi-integration.md`, sección 2. Los demás son contratos previstos.

## 12. Criterios de aceptación

**Criterios de datos reales (política permanente, `CLAUDE.md`):**

- [x] Producción bloquea el acceso sin proveedor real: hoy se cumple (motivo `provider-not-implemented`).
- [x] El repositorio mock y el login JSON no forman parte del bundle de producción: verificado con `build:verify`.
- [ ] Ningún flujo de presentación usa fixtures ni respuestas simuladas: pendiente hasta conectar las pantallas a la API.
- [ ] `seed.sql` no se ejecuta en presentación, staging ni producción: procedimiento a comprobar en el proyecto real.
- [ ] Autenticación real con Supabase Auth en todas las pantallas de acceso.
- [ ] Persistencia real comprobada para cada acción que el portal presenta como completada.
- [ ] Información no disponible mostrada explícitamente cuando falte una integración (en especial Logixtic).
- [ ] Flujos completos de extremo a extremo probados contra infraestructura real.

Antes de habilitar usuarios reales, todos los criterios siguientes deben cumplirse:

- [ ] Proveedor de identidad implementado en el frontend, con cierre de sesión y renovación de tokens.
- [ ] FastAPI valida identidad, membresía, rol y tenant en cada endpoint y en cada recurso.
- [ ] Repositorio remoto implementado y probado contra los contratos de `fastapi-integration.md`.
- [ ] Ninguna lectura omite el tenant. Pruebas de acceso cruzado entre empresas en API y en interfaz.
- [ ] Comentarios internos nunca visibles para clientes, verificado en el servidor.
- [ ] Persistencia de comentarios, solicitudes, decisiones y versiones documentales, con auditoría.
- [ ] Adjuntos validados en el servidor (tipo, tamaño, contenido) y almacenados fuera de la vista pública.
- [ ] Revisión de seguridad (OWASP ASVS) y registro de accesos sin datos personales.
- [ ] Auditoría de accesibilidad automatizada y revisión manual con lectores de pantalla.
- [ ] Textos legales aprobados y datos del responsable completados.
- [ ] Pruebas E2E contra staging con datos no productivos.
- [ ] Chunk principal reducido o justificado (hoy 481 kB sin gzip).
- [ ] Repositorio privado antes de cualquier publicación del historial con datos de prueba.

## 13. Modelo multi-tenant

- Todo modelo de dominio lleva `tenantId` (`src/types/domain.ts`).
- Todas las lecturas del repositorio reciben `tenantId` y filtran por él. Un ID de otra empresa devuelve `null` o lista vacía.
- Las claves de caché de TanStack Query incluyen `tenantId`.
- Las pruebas comprueban que un DO o una cotización de otra empresa no se muestra por URL, y que no es posible comentar sobre un evento de otro tenant.
- En desarrollo, la cuenta creada en el registro se asigna a la empresa sintética `tn-andino`. El servidor fija esa asignación; el cliente no puede elegir otra.

## 14. Modelo de eventos y comentarios anidados

**Evento** (`OperationEvent`): identificador, operación, tenant, fecha y hora, autor, tipo (`status_change`, `news`, `document`, `action_required`), estado anterior y nuevo cuando aplica, título, descripción, adjuntos y visibilidad.

**Comentario** (`EventComment`): `id`, `tenant_id`, `operation_id`, `event_id`, `parent_comment_id`, `author_id`, `body`, `created_at`, `visibility`.

Reglas, cubiertas por pruebas:

1. Todo comentario pertenece a un evento. No existe una pestaña general de comentarios.
2. Las respuestas usan `parent_comment_id` y se muestran anidadas.
3. Un comentario o respuesta **no cambia el estado** de la operación.
4. Un cambio de estado crea un evento nuevo; el historial no se sobrescribe.
5. Los comentarios con `visibility = internal` no se devuelven a clientes.
6. Un comentario cuyo padre pertenece a otro evento se rechaza.
7. Los hilos de distintos eventos o empresas están completamente separados.

## 15. Comandos de instalación, pruebas y ejecución

Desde `apps/web`:

```bash
npm install                  # dependencias
npm run dev                  # http://127.0.0.1:5173 (acceso local activo)
npm run typecheck            # TypeScript estricto
npm test                     # pruebas unitarias
npm run build:verify         # build de verificación + inspección del bundle
npm run test:e2e             # E2E de desarrollo (escritorio y móvil)
npm run test:e2e:prod        # E2E del build de producción (requiere build:verify)
npm run build                # build de producción: FALLA sin configuración real (intencional)
```

Desde `apps/api` (PostgreSQL local en `127.0.0.1:5432`, base `portal_test`):

```powershell
$env:DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal_test"
.\.venv\Scripts\alembic.exe upgrade head                 # aplica 0001 y 0002
$env:PORTAL_TEST_DATABASE_URL = $env:DATABASE_URL
.\.venv\Scripts\python.exe -m pytest -q                  # 74 pruebas con PostgreSQL; sin variable se omiten las 52 de integración
.\.venv\Scripts\python.exe -m ruff check app tests migrations
.\.venv\Scripts\uvicorn.exe app.main:create_app --factory --reload --port 8000
```

Con Chrome instalado, anteponer `PW_CHANNEL=chrome` a los comandos de E2E. Sin esa variable: `npx playwright install chromium`.

Configuración de producción (obligatoria para `npm run build`):

| Variable | Valor | Notas |
|---|---|---|
| `VITE_AUTH_PROVIDER` | `supabase` | Único valor reconocido. Requiere configuración pública de Supabase; el acceso permanece bloqueado hasta conectar las pantallas. |
| `VITE_API_BASE_URL` | URL `https://` de FastAPI | Obligatoria. |

Las variables `VITE_*` son públicas en el bundle. **Nunca** poner secretos en ellas.

## 16. Requisitos de despliegue

No hay despliegue. Requisitos para cuando exista:

- Node 22 y npm 10 para el build.
- Hosting estático para `apps/web/dist`, con cabeceras de seguridad (CSP, HSTS, `X-Content-Type-Options`).
- Backend FastAPI desplegado con HTTPS y acceso a Supabase.
- Ningún componente de desarrollo en el artefacto: `npm run build:verify` debe pasar sobre el artefacto final.
- Repositorio privado y revisión de commits antes de cualquier publicación.

## Anexo A. Verificación de esta entrega

Ejecutado sobre el código de `v0.1.0-alpha.1`. Detalle en `docs/validation.md` (Fase 06).

Verificación de la fase 07B (integración preparada). Anexo original de `v0.1.0-alpha.1`, actualizado:

- `npm run typecheck` (web): sin errores.
- `npm test` (web): 13 archivos, **128 pruebas aprobadas** (40 nuevas del adaptador HTTP).
- `npm run build:verify`: correcto; bundle verificado: 21 archivos sin datos sintéticos ni autenticación local.
- `npm run build` sin configuración: falla **a propósito** (`falta VITE_AUTH_PROVIDER`).
- `apps/api`: **74 pruebas aprobadas** con PostgreSQL 18 local (22 unitarias y 52 de integración y RLS), `ruff check` y `ruff format --check` sin incidencias.
- E2E de Playwright (`test:e2e`, `test:e2e:prod`): **no re-ejecutados en esta fase**. No hubo cambios de interfaz; las cifras anteriores siguen siendo las de `docs/validation.md`.

## Anexo B. Limitaciones conocidas

- Sin proyecto de Supabase configurado, sin despliegue de la API y sin repositorio remoto conectado a las pantallas.
- Sin integración con Logixtic. El modelo `Operation` del dominio requiere campos que la API no expone (sección 17).
- Las pruebas de la API usan PostgreSQL local, no Supabase. El comportamiento con los roles reales de Supabase no está verificado.
- La verificación de firma (JWKS o secreto) debe confirmarse con el proyecto real.
- Sin correo real para la recuperación de contraseña.
- Adjuntos y vistas previas no implementados fuera de la presentación local.
- Sin auditoría automatizada de accesibilidad. Solo Chromium.
- Chunk principal de 481 kB (151 kB gzip).
- Los textos legales son borradores pendientes de aprobación.
- Las pruebas E2E pueden agotar el tiempo por prueba la primera vez tras cambios grandes, por compilación en frío del servidor de desarrollo.

## 17. Estado de integración y pasos para continuar (fase 07B)

### Qué existe

- **API FastAPI** (`apps/api`): verificación de JWT de Supabase, membresías, siete rutas bajo `/api/v1` (lectura, creación de comentarios y `/me`), sobre de error único y contrato OpenAPI con errores documentados (`/openapi.json` fuera de producción).
- **Base de datos** (`apps/api/migrations`): `0001_foundation` (esquema, claves compuestas, RLS y rol `portal_app`) y `0002_supabase_grants_hardening` (retira privilegios de `anon` y `authenticated`).
- **Adaptador frontend** (`apps/web/src/services/api/`): cliente HTTP tipado, mapeadores `snake_case`→`camelCase` con validación, y `HttpPortalRepository`. Probado con respuestas sintéticas. No conectado.
- **Documentación**: `docs/fastapi-integration.md` (estado real y brechas), `docs/supabase-preparation.md` (preparación y decisiones pendientes), `docs/architecture.md` y `apps/api/README.md`.

### Qué no existe todavía

- Proyecto de Supabase configurado. No hay credenciales en el repositorio, ni deben existir.
- Sesión de Supabase en el frontend. El inicio de sesión local no se conecta a la API a propósito.
- Sincronización con Logixtic. Las tablas de operaciones y eventos son referencias sin proceso que las llene.
- Endpoints de solicitudes, adjuntos, documentos, cotizaciones y Logix.

### Pasos concretos para Enrique

1. **Decidir la fuente de datos de operaciones** con Logixtic: qué campos (tipo, transporte, origen, destino, fechas) se sincronizan y cómo. Mientras tanto, el modelo `Operation` del dominio no puede poblarse desde la API. Ver `docs/fastapi-integration.md`, sección 6.
2. **Crear un proyecto de Supabase de prueba** (no el de producción de Logixtic). Activar correo y contraseña en Auth.
3. **Confirmar el tipo de firma JWT** del proyecto (JWKS o secreto heredado) y configurar solo esa variable en el `.env` local de la API.
4. **Crear un rol de servicio** sin `BYPASSRLS` que pueda hacer `SET ROLE portal_app`. No usar `service_role` en la API.
5. **Aplicar `alembic upgrade head`** en el proyecto de prueba. Comprobar que `portal_app` no tiene `BYPASSRLS` y que `anon`/`authenticated` no tienen privilegios sobre las tablas del portal.
6. **Aprovisionar empresas, perfiles y membresías** con datos sintéticos y un proceso revisable.
7. **Probar con un token real** de un usuario de prueba: `/me`, operaciones, eventos y comentarios, y comprobar que una empresa ajena responde 404.
8. **Ejecutar la suite de integración** contra el proyecto de prueba (`PORTAL_TEST_DATABASE_URL`).
9. **Solo después**: conectar la sesión de Supabase al frontend y cargar `HttpPortalRepository` con `loadRemoteRepository`, sin tocar las pantallas.

### Decisiones que requieren aprobación

- Qué campos de operación y empresa son visibles para el cliente (define el contrato y las brechas de la sección 6 de `fastapi-integration.md`).
- Si `author_id` debe exponerse como identificador opaco o si la interfaz debe dejar de depender de él.
- Cuándo activar la documentación de la API en un entorno compartido (`DOCS_ENABLED`).

### Commits de esta fase

Rama `feat/supabase-fastapi-foundation`, sin push. Ver `git log` para el detalle. Las pruebas y el estado de Git del momento de la entrega figuran en la sección Anexo A.

## 18. Despliegue y migraciones (fase 08C)

- **Un servicio:** `Dockerfile` en la raíz sirve React y FastAPI desde el mismo origen. Guía: `docs/deployment-render.md`.
- **Render gratuito:** `render.yaml` define un único Web Service Docker. No hay base de datos ni segundo servicio en Render. Límites: 512 MB, suspensión por inactividad, disco efímero y sin comando pre-deploy.
- **Migraciones:** la fuente canónica es `supabase/migrations/` con Supabase CLI. Alembic queda como referencia. No ejecutar ambos sobre el mismo esquema. Procedimiento de transición en `docs/database-migration-strategy.md`.
- **Estado:** nada se ha desplegado ni migrado en remoto. Docker y PostgreSQL no se han ejecutado por falta de memoria en esta sesión.

Pasos para Enrique:

1. Crear el proyecto de Supabase de desarrollo y configurar Auth (correo y contraseña; sin registro abierto).
2. Aplicar `supabase/migrations` en el proyecto de desarrollo, con revisión previa (`supabase db push --dry-run`).
3. Crear el rol de la API sin `BYPASSRLS` y su cadena de conexión (Session Pooler si Render no tiene IPv6).
4. Crear el servicio en Render desde `render.yaml` y cargar los secretos en el panel.
5. Verificar `/health`, la navegación SPA y que `/api/v1/...` inexistente responde JSON.

## 19. Estado de verificación y requisitos para Supabase (fase 09A)

### Pruebas ejecutadas y resultado

| Área | Qué se ejecutó | Resultado |
|---|---|---|
| API (unitarias) | `pytest tests/unit` | 29 aprobadas |
| API (integración, RLS, aislamiento, comentarios, aprovisionamiento) | `pytest` contra PostgreSQL 17 local en una base desechable creada solo con `supabase/migrations/*.sql` y `supabase/seed.sql` | **84 aprobadas en total, 0 omitidas** |
| API (lint) | `ruff check` y `ruff format --check` | Sin incidencias |
| Frontend (tipos) | `npm run typecheck` | Sin errores |
| Frontend (pruebas) | `npx vitest run` | 178 aprobadas (17 archivos), incluidas las pruebas de política de datos reales |
| Frontend (build) | `npm run build:verify` con valores públicos sintéticos | Correcto; bundle sin motor de Logix, sin fixtures, sin autenticación local |
| Guardia de producción | Cuatro builds con configuración incorrecta | Fallan con el motivo esperado |
| Workflow y Render | Análisis de sintaxis YAML | Correcto. **No se han ejecutado en GitHub.** |

**No ejecutado:** construcción de la imagen Docker, comprobaciones HTTP sobre el contenedor, E2E de Playwright,
y el workflow de GitHub Actions. Docker no se ha arrancado por memoria. La CI tampoco se ha ejecutado porque no hay push.

### Hallazgos de seguridad

- **El repositorio de GitHub es público.** No se ha hecho push de los cuatro commits nuevos, y no se debe hacerlo
  mientras siga público. Decisión pendiente del responsable.
- **Credencial de demostración en la rama pública.** `DEMO_PASSWORD` (fixture de presentación) aparece como literal
  en `apps/web/src/data/fixtures/demo-data.ts` y en pruebas E2E. No se incluye en el bundle de producción, pero
  queda expuesta en el historial público. Remediación recomendada: sustituir el valor por uno no reutilizable en
  las pruebas y tratar el actual como comprometido. Reescribir el historial requiere autorización explícita.
- **Motor de respuestas de Logix en producción:** el asistente se importaba estáticamente en la shell y su motor de
  reglas (con respuestas predefinidas) estaba en el bundle de producción. Corregido: ahora solo se carga en desarrollo.

### Lista concreta para crear y conectar Supabase

1. Crear un proyecto **de desarrollo** en Supabase (no el de Logixtic). Anotar la URL y la clave publicable.
2. Activar correo y contraseña en Auth. Desactivar el registro abierto (`enable_signup = false`, ya en `config.toml`).
3. Aplicar `supabase/migrations/*.sql` con `supabase db push --dry-run` primero y luego `supabase db push`.
4. Crear el rol de la API sin `BYPASSRLS`, concederle `portal_app` (`GRANT portal_app TO <rol>`) y guardar su
   cadena de conexión fuera del repositorio. Confirmar si Render necesita el Session Pooler.
5. Crear el usuario de prueba en Auth (invitación) y aprovisionar su empresa y membresía con
   `apps/api/scripts/provision_dev.py`, indicando el identificador de ese usuario.
6. Probar la API con un token real: `/me`, operaciones, eventos y un comentario persistido. Probar que una empresa
   ajena responde 404.
7. Solo entonces conectar login, recuperación y guarda de rutas a Supabase Auth en el frontend.

### Requisitos antes del primer despliegue

- Decisión sobre la visibilidad del repositorio y sobre la credencial de demostración.
- Ejecución verde del workflow `verify` en GitHub: **cumplido** (ver sección 21).
- Construcción y prueba de la imagen Docker.
- Proyecto de Supabase de desarrollo configurado, con la prueba del punto 6 superada.
- Pantallas de acceso conectadas a Supabase (hoy el modo de producción sigue bloqueado por diseño).
- Recursos oficiales de marca (logotipo, isotipo y avatar de Logix).

## 20. Verificación de contenedor y primera verificación remota (fase 09B)

### Ejecutado localmente

- **Proceso igual al del contenedor:** Uvicorn con un solo worker, sirviendo el `dist` compilado con valores sintéticos,
  sin base de datos (`/health` y las rutas de navegación no la usan):
  - `GET /health` → 200 JSON.
  - `GET /login`, `GET /operaciones` y `GET /operaciones/{id}` → 200 HTML de React, también al recargar.
  - `GET /api/v1/ruta-inexistente` → 404 JSON con el sobre de error, nunca HTML.
  - `GET /api/v1/me` sin token → 401 JSON `authentication_required`.
- **Sin autenticación configurada en desarrollo:** las rutas protegidas responden 503 `auth_not_configured`.
- **Producción sin autenticación configurada:** la aplicación no arranca (error de validación de configuración).

### No ejecutado

- **Construcción de la imagen Docker** y comprobaciones sobre el contenedor. Docker Desktop está parado y no hay memoria para arrancarlo.
- **Workflow `verify` en GitHub Actions:** ejecutado en la fase 21 (sección 21). Los tres jobs pasaron en la primera ejecución.
- **E2E de Playwright**, incluidas las especificaciones que se modificaron para retirar la credencial de demostración. Sigue sin ejecutarse; no forma parte de `verify`.

### Seguridad

- El repositorio está **privado** desde la fase 21 (verificado con `gh repo view`).
- La credencial de demostración se ha retirado del código. Sigue en el historial de commits anteriores a `788ec62`. No se reescribió el historial. Se recomienda tratarla como comprometida y no reutilizarla.
- No hay `.env`, JSON locales de autenticación, claves de servicio ni manuales internos rastreados por Git.

### Primera verificación remota

Resuelta en la sección 21.

## 21. Verificación remota en GitHub Actions y Draft Pull Request (fase 10)

### Publicación

- Repositorio: `jaimecardona-lgtm/portalCliente`, **privado** (confirmado antes de publicar).
- Rama `feat/supabase-auth-integration` sincronizada con el remoto. No hubo push nuevo: el remoto ya contenía los commits.
- Draft Pull Request hacia `main`, sin fusionar: <https://github.com/jaimecardona-lgtm/portalCliente/pull/1>
- No se ha modificado `main`, no se ha reescrito el historial, no se ha desplegado en Render y no se ha tocado Supabase.

### Ejecución de `verify`

Ejecución: <https://github.com/jaimecardona-lgtm/portalCliente/actions/runs/43254005592> (evento `pull_request`).
No se añadió ningún secreto a GitHub Actions.

| Job | Resultado | Pasos verificados | Evidencia de la ejecución |
|---|---|---|---|
| API y migraciones | ✅ éxito | Lint (`ruff check` y `ruff format --check`), aplicación de `supabase/migrations/*.sql` en orden y `seed.sql` sobre `postgres:17` desechable, pytest | Migraciones `20261111000000_foundation.sql` y `20261111000100_supabase_grants_hardening.sql` aplicadas sin error. **83 aprobadas, 1 omitida, 1 aviso.** |
| Frontend | ✅ éxito | `npm ci`, `typecheck`, `vitest run`, `build:verify` | Vitest: **17 archivos aprobados**. `build:verify` construido sin errores. |
| Imagen Docker y comprobaciones HTTP | ✅ éxito | Build con argumentos públicos, búsqueda de ficheros sensibles y secretos en la imagen, arranque y comprobaciones HTTP | `/health` → `status: ok`. `/login`, `/operaciones` y `/operaciones/{id}` → `text/html`. API inexistente → `404 application/json`. `/api/v1/me` sin token → `401 application/json`. Imagen sin ficheros sensibles. |

### Diferencias respecto a la ejecución local (fase 09A)

- **Pytest en CI: 83 aprobadas y 1 omitida**, frente a 84 aprobadas en local. La omitida es `tests/integration/test_rls.py:251`: exige los roles `anon` y `authenticated`, que solo existen en Supabase. No es un fallo. Se verificará cuando exista el proyecto de desarrollo de Supabase.
- **Aviso del paso de pytest:** `StarletteDeprecationWarning` por usar `httpx` con `starlette.testclient`. No afecta al resultado; queda como deuda técnica.
- **Docker:** la imagen se construyó y comprobó en GitHub Actions, no en local. Con esto queda cubierto el punto que la fase 09B dejó pendiente.

### Pendiente tras esta fase

1. Crear el proyecto de desarrollo de Supabase (no el de Logixtic). Autorización pendiente.
2. Aplicar migraciones en Supabase con `supabase db push --dry-run` antes de cualquier cambio. Autorización pendiente.
3. Ejecutar las pruebas de RLS contra los roles reales de Supabase, incluida la omitida.
4. Ejecutar las pruebas E2E de Playwright, que no están en `verify`.
5. Retirar el aviso de deprecación de `httpx` en las pruebas de la API.
6. Tratar la credencial de demostración del historial como comprometida. No reescribir el historial sin autorización explícita.

## 22. Estado del MVP de documentos (sprint final)

Esta sección resume lo verificado al cierre del sprint. Cada cifra procede de una ejecución real. Lo que no aparece
como "probado contra Supabase" **no se ha ejecutado contra el proyecto real**.

### 22.1 Tabla de estado

| Función | Estado | Cómo se verificó |
|---|---|---|
| Inicio de sesión, cierre de sesión y guarda de rutas con Supabase Auth | Terminada | Pruebas web y comprobación de navegador en modo Supabase (11/11) |
| Identidad y clientes finales desde FastAPI (`/me`, `/client-access`) | Terminada | Pruebas de integración con PostgreSQL |
| Listado de documentos de cliente final | Terminada | Pruebas de integración (RLS). Pantalla verificada por compilación y revisión estática; sin prueba de interfaz |
| Subida de documentos generales (sin operación) | Terminada | Pruebas de integración y del cliente HTTP; almacenamiento simulado; sin prueba de interfaz |
| Subida de documentos de operación | Terminada en backend | Pruebas de integración; sin operaciones reales para usarla en la interfaz |
| Enlace firmado temporal para abrir o descargar | Terminada | Pruebas de integración y de cliente HTTP; no se guarda la URL |
| Reemplazo con nueva versión y retirada del objeto anterior | Terminada | Pruebas de integración, incluido el fallo de borrado |
| Retirada con confirmación | Terminada | Pruebas de integración y del cliente HTTP; la confirmación en pantalla no tiene prueba de interfaz |
| Limpieza de huérfanos y reintentos (procedimiento administrativo) | Terminada | Pruebas de reconciliación |
| Bucket privado (aprovisionamiento) | Preparada | Pruebas con transporte simulado; **no ejecutada contra Storage real** |
| E2E contra Supabase real | Preparada | Se omite sin configuración; **no ejecutada** |
| Operaciones (DO) reales | **Pendiente** | Sin integración oficial con el SaaS Logixtic |
| Informes operativos de Logix | **Pendiente** | Requiere DO y fuentes autorizadas |
| Adjuntos de solicitudes | **Pendiente** | No implementado |

### 22.2 Resultados de verificación (cierre del sprint)

| Suite | Resultado |
|---|---|
| API, con PostgreSQL migrado (6 migraciones y seed sintético, solo base de pruebas) | 184 aprobadas, 0 fallidas |
| API, sin base de datos | 78 aprobadas, 106 omitidas (las de integración) |
| Ruff (lint y formato) | Correcto |
| Web: typecheck | Correcto |
| Web: Vitest | 224 aprobadas, 0 fallidas |
| Web: build de verificación con revisión del bundle | Correcto: 21 archivos, sin datos de ejemplo ni secretos |
| Docker: build de imagen | **No ejecutado**: Docker Desktop no estaba en ejecución |
| GitHub Actions | **No ejecutado**: no hay push |
| E2E contra Supabase real | **No ejecutado** (se omite sin configuración) |

### 22.3 Variables de entorno

| Variable | Dónde | Secreta | Notas |
|---|---|---|---|
| `DATABASE_URL` | API (Render) | Sí | Rol `portal_api`, nunca `postgres`. |
| `DATABASE_APP_ROLE` | API | No | `portal_app`. |
| `SUPABASE_URL` | API | No | URL del proyecto. |
| `SUPABASE_JWKS_URL` o `SUPABASE_JWT_SECRET` | API | Según el caso | Solo una de las dos. |
| `SUPABASE_SECRET_KEY` | **Solo API** (Render, secreto) | **Sí** | Clave privilegiada de Storage. Sin ella, documentos responden 503. |
| `STORAGE_SIGNED_URL_SECONDS` | API | No | 300 por defecto. |
| `VITE_AUTH_PROVIDER` | Build del frontend | No | `supabase`. |
| `VITE_API_BASE_URL` | Build del frontend | No | `/api/v1` (mismo origen). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Build del frontend | No, pero específicas | Solo la clave publicable. |
| `OPENROUTER_*`, `LOGIX_*` | API | Sí (la clave) | Desactivados. No activar sin autorización. |

### 22.4 Procedimiento Docker y Render

1. Construir la imagen desde la raíz del repositorio (ver `docs/deployment-render.md`). Los argumentos de build son
   solo los `VITE_*` públicos. La clave de Storage **no** es argumento de build.
2. Configurar en Render las variables de la tabla 22.3 como secretas (`sync: false` en `render.yaml`).
3. Desplegar solo con autorización del responsable.

Estado: el paso 1 no se ha ejecutado en esta fase.

### 22.5 Limitaciones conocidas

- El portal no consume DO oficiales: no existe la integración con el SaaS Logixtic.
- Logix no genera informes reales ni responde con datos operativos. No está activo.
- Un usuario con varias empresas debe elegirla con `X-Tenant-Id`; la pantalla de elección aún no existe.
- Los archivos reales no se han subido a Supabase Storage desde el sprint: toda la verificación de almacenamiento es simulada.
- Antes de datos reales: registro público desactivado, `portal_api` verificado, migraciones aplicadas con autorización.

### 22.6 Preflight de salida a producción (verificado el 12/11/2026)

| Comprobación | Resultado | Tipo de bloqueo |
|---|---|---|
| Repositorio GitHub | Privado | Ninguno |
| Proyecto Supabase vinculado | `fjfnuttziwhxbjhkdtmk` (coincide) | Ninguno |
| Host del Session Pooler en `DATABASE_URL` | No resuelve por DNS | **Error DNS** |
| Rol `portal_api` | No verificable: sin conexión | **Bloqueado por el error DNS** |
| Migraciones en el historial remoto | Solo `20261111000000` y `20261111000100` | Ninguno (estado conocido) |
| Migraciones pendientes (dry-run) | `…112000000`, `…112000100`, `…112000200`, `…112000300` | Ninguno (solo listado) |
| Objetos de las migraciones pendientes en remoto | **Ya existen** tablas `client_documents`, `client_accounts`, `client_memberships`, `storage_cleanup_jobs`, `sync_runs`, `client_document_events` | **Desviación**: estructura aplicada fuera del historial. Requiere revisión antes de cualquier `db push` |
| Bucket `logixtic-client-documents` | La CLI no muestra buckets. No verificado | Pendiente de consulta autorizada |
| `SUPABASE_SECRET_KEY` en el entorno local | Ausente | **Configuración ausente** |
| Registro público de Auth | Activo (comprobado el 12/11) | Pendiente del propietario |
| Login, JWT, `/me`, RLS con usuario real | No probado | Bloqueado: sin cuenta autorizada ni conexión |

Conclusión: **no existe todavía ninguna prueba E2E real completada**. La validación de la estructura remota exige la
consulta de solo lectura `docs/sql/fase-13-estado-remoto-solo-lectura.sql`, ejecutada por el propietario.

### 22.7 Actualización: personal interno (RBAC) y cifras vigentes

| Función | Estado | Cómo se verificó |
|---|---|---|
| Roles internos (`platform_admin`, `qa`, `developer`, `support`) con matriz de permisos | Implementada en local | Pruebas de integración con RLS |
| Tenants verificados y asignados para personal | Implementada en local | Pruebas: tenant no verificado y no asignado denegados |
| Panel `/soporte` y selección de contexto | Implementada en local | Pruebas del cliente HTTP y garantías estáticas; **sin prueba de interfaz** |
| Auditoría de accesos de personal | Implementada en local | Pruebas que verifican filas permitidas y denegadas |
| Aprovisionamiento del primer usuario QA | **Preparado, no ejecutado** | Requiere UUID real y autorización escrita del responsable |
| Migración `20261112000400_platform_staff` | **No aplicada en remoto** | Pendiente de reconciliar objetos existentes (sección 22.6) |

Cifras vigentes del cierre de esta fase: **API con PostgreSQL migrado: 205 aprobadas; sin base de datos: 78 aprobadas;
web (Vitest): 236 aprobadas.** Las cifras de la sección 22.2 corresponden al cierre anterior.

Procedimiento y modelo completos: `docs/rbac-personal-interno.md`.
