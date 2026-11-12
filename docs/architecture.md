# Arquitectura — Logixtic Client Portal (v0.1.0-alpha.1)

Este documento describe la arquitectura **actual**. Donde algo aún no existe, se indica explícitamente como pendiente.

## 1. Vista general

```text
┌──────────────────────────── Navegador (apps/web) ────────────────────────────┐
│ Páginas y componentes (src/features/*, src/layouts, src/components)           │
│   │  useRepository() · useSession() · tenantKey()                            │
│   ▼                                                                          │
│ Servicios de datos (src/services/repositories/*)                             │
│   ├── PortalRepository (contrato)                                            │
│   └── Repositorio local (mock-repository.ts) — solo desarrollo               │
│                                                                              │
│ Autenticación de desarrollo (src/services/local-auth-api.ts)                 │
│   └── fetch → /__local-auth/* (cookie HttpOnly)                              │
└──────────────────────────────────────────────────────────────────────────────┘
          │ solo en `vite dev`                              │ pendiente
          ▼                                                 ▼
┌──── Servidor de desarrollo (scripts/lib/local-auth) ──┐  ┌──── FastAPI (no existe) ────┐
│ http.mjs → service.mjs → store.mjs                    │  │ identidad, membresías,      │
│ JSON en apps/web/local/auth/ (ignorado por Git)        │  │ permisos, datos de Logixtic │
└───────────────────────────────────────────────────────┘  └─────────────────────────────┘
          │ futuro                                          │ futuro
          ▼                                                 ▼
    Supabase Auth + PostgreSQL (no conectado)          Logixtic (no integrado)
```

## 2. Frontend

### Stack

| Área | Tecnología | Versión instalada |
|---|---|---|
| Build | Vite | 8.3.8 |
| Lenguaje | TypeScript estricto | 7.0.2 |
| UI | React | 19.3.1 |
| Rutas | TanStack Router (definición por código) | 1.170.46 |
| Datos en cliente | TanStack Query | 5.107.1 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) | 4.3.5 |
| Iconos | lucide-react | 1.72.0 |
| Formularios | React Hook Form + Zod | 7.92.0 / 4.6.7 |
| Tipografía | Inter autohospedada (`@fontsource-variable/inter`) | 5.x |
| Pruebas | Vitest, Testing Library, jsdom; Playwright Test | 5.1.0; 1.65.x |

Las versiones exactas están en `apps/web/package-lock.json`. No se usa shadcn/ui: los primitivos son propios para mantener la identidad visual.

### Estructura de carpetas

```text
apps/web/src/
├── app/                 Raíz: providers, arranque y carga del repositorio local
├── config/              runtime.ts: modo de acceso y funciones por entorno
├── content/legal/       Versión y contenido de términos y privacidad (borradores)
├── components/          Primitivos (ui/), timeline genérico, marca
├── data/fixtures/       Datos sintéticos (solo desarrollo)
├── features/
│   ├── account/         Información de cuenta (/cuenta) y perfil (/perfil)
│   ├── assistant/       Logix: motor de reglas y panel (solo desarrollo)
│   ├── auth/            Login, registro, recuperación, sesión, guarda
│   ├── dashboard/       Torre de control
│   ├── documents/       Gestión documental
│   ├── legal/           Términos y privacidad (públicos)
│   ├── marketplace/     Vista futura, sin acciones
│   ├── operations/      Listado, detalle DO, timeline, hilos, filtros
│   ├── quotes/          Cotizaciones y reglas de decisión
│   └── requests/        Solicitudes y formulario
├── layouts/             AppShell, navegación, selector de empresa de QA (solo desarrollo)
├── lib/                 Formato de fechas y monedas, reloj de referencia
├── routes/              Mapa de rutas y guardas
├── services/            Repositorios, cliente de autenticación local, contratos de auth
├── styles/              Tokens de diseño (Tailwind @theme)
├── test/                Configuración y control de texto visible
└── types/               Modelos de dominio
apps/web/scripts/lib/local-auth/   Servidor de autenticación de desarrollo
apps/web/e2e/, e2e-prod/           Pruebas Playwright (desarrollo y build de producción)
```

### Rutas

| Ruta | Acceso | Módulo |
|---|---|---|
| `/login`, `/registro` | Público | Acceso y alta de cuenta (desarrollo) |
| `/recuperar-contrasena`, `/restablecer-contrasena` | Público | Recuperación (desarrollo) |
| `/terminos`, `/privacidad` | Público | Textos legales (borrador) |
| `/` | Autenticado | Torre de control |
| `/operaciones`, `/operaciones/$operationId` | Autenticado | Operaciones y detalle DO |
| `/documentos` | Autenticado | Gestión documental |
| `/cotizaciones`, `/cotizaciones/$quoteId` | Autenticado | Cotizaciones |
| `/solicitudes`, `/solicitudes/nueva` | Autenticado | Solicitudes |
| `/cuenta` | Autenticado | Información de la empresa (solo lectura) |
| `/perfil` | Autenticado | Perfil personal |
| `/marketplace` | Autenticado, solo si la función está activa | Vista futura |

La guarda de acceso vive en `beforeLoad` del layout `app` (`routes/router.tsx`). Redirige a `/login?redirect=…` cuando no hay acceso habilitado o sesión.

### Pantallas y datos

- Cada pantalla lee datos a través de `useRepository()` y TanStack Query, con claves que incluyen `tenantId`.
- Las pantallas pesadas se cargan con `lazy()` por ruta. El login, el registro, la recuperación y la torre de control se cargan en el bundle inicial.
- Las acciones de escritura (decisión de cotización, envío de solicitud, nueva versión documental, edición de perfil) solo existen en desarrollo y tienen efecto únicamente en la sesión del navegador o en el servidor local.

## 3. Repositorios de datos

`PortalRepository` (`services/repositories/portal-repository.ts`) es el contrato único que consumen las pantallas. Reglas que cumple cualquier implementación:

- Todo método recibe `tenantId` y filtra por él.
- Un recurso de otra empresa se trata como inexistente (`null` o lista vacía).
- Las escrituras se devuelven con el modelo ya validado.

Implementaciones:

| Implementación | Estado | Dónde |
|---|---|---|
| Local (mock) | Existe. Solo desarrollo. Carga diferida (`loadLocalRepository`). **Es la opción activa.** | `mock-repository.ts` |
| Remota (FastAPI) | Adaptador preparado y probado con respuestas sintéticas. **No conectado a las pantallas.** Varios métodos del contrato aún no tienen endpoint. | `services/api/http-portal-repository.ts` |

Detalle de qué cubre la API y qué brechas hay: `docs/fastapi-integration.md`.

`replaceUser` es un método opcional del repositorio local que incorpora la cuenta de la sesión (por ejemplo, tras registrarse o editar el nombre). No forma parte del contrato remoto.

## 4. Estado y sesiones

- **Sesión del navegador**: `SessionProvider` (`features/auth/session-context.tsx`) guarda `{ userId, tenantId, simulated }`. Se persiste en `sessionStorage` (`session-storage.ts`) solo como copia de conveniencia.
- **Sesión real (desarrollo)**: cookie `logixtic_local_session`, HttpOnly y SameSite=Strict, validada por el servidor. Al arrancar, `bootstrapLocalSession` consulta `/me` y restablece la sesión del navegador. Si no hay cookie válida, la sesión del navegador se borra.
- **Identidad en pantallas**: `user` y `tenant` se resuelven desde el repositorio. La consulta de identidad usa una clave que incluye `tenantId`.
- **Cierre de sesión**: `useEndSession` navega a `/login`, borra la sesión del contexto y pide al servidor invalidar la cookie. El orden importa (ver `docs/validation.md`, fase 04).

## 5. Autenticación local (desarrollo) y futura autenticación real

### Autenticación local — qué existe

- Servidor: `scripts/lib/local-auth/` (`http.mjs`, `service.mjs`, `store.mjs`, `index.mjs`). Se registra en Vite solo en `vite dev` (`vite.config.ts`).
- Almacenamiento: `apps/web/local/auth/` (JSON, ignorado por Git). Escrituras atómicas y serializadas. Contraseñas en hash scrypt con sal. Sesiones y tokens de recuperación solo como hash.
- Endpoints bajo `/__local-auth`: registro, login, logout, `me`, recuperación, restablecimiento, perfil, cambio de contraseña, y una bandeja local solo para localhost.
- Seguridad: solo loopback y orígenes locales; límites de tamaño y tipo de contenido; bloqueo por intentos; el servidor decide tenant (`tn-andino`) y rol (`client`).
- Documentación completa: `docs/autenticacion-local.md`.

### Autenticación real — pendiente en el frontend

Supabase Auth gestionará credenciales, recuperación por correo y sesiones. **FastAPI ya verifica los tokens de Supabase** (firma, emisor, audiencia, caducidad y rol) y resuelve la empresa por membresía; eso está probado con tokens sintéticos. Falta que el frontend obtenga la sesión de Supabase. Ver `docs/supabase-preparation.md`. Los contratos de tipo están en `src/services/auth/contracts.ts` (`AuthService`, `UserRepository`, `SessionService`, `TenantMembershipRepository`).

## 6. Aislamiento multi-tenant

| Capa | Mecanismo | Alcance real |
|---|---|---|
| Datos locales | Repositorio filtra por `tenantId` | Presentación. No es seguridad. |
| Caché del cliente | Claves de consulta con `tenantId` | Evita mostrar datos de otra empresa tras cambiar de empresa en QA. |
| Servidor local | Tenant y rol fijados por el servidor; cookie HttpOnly | Solo desarrollo. |
| FastAPI (`apps/api`) | Tenant desde el token y la membresía, nunca desde la URL. Sobre de error sin datos internos. | Implementado y probado. Sin proyecto Supabase real. |
| Base de datos (PostgreSQL) | Filtros por `tenant_id` en cada consulta, RLS con rol `portal_app` sin `BYPASSRLS`, claves compuestas entre tablas | Implementado y probado en PostgreSQL local. Pendiente en Supabase. |
| Frontend → API | `HttpPortalRepository` filtra por empresa activa y no envía peticiones de otra empresa | Preparado y probado. No conectado. |

Las pruebas E2E comprueban que un DO o una cotización de otra empresa no se muestra por URL.

## 7. Timeline, eventos y hilos

- `EventTimeline` es un componente genérico: recibe `TimelineItem[]` y un render prop para la conversación. No conoce operaciones.
- Cada evento tiene su hilo (`EventThread`) consultado por `(tenantId, operationId, eventId)`.
- `buildThread` (`thread-utils.ts`) arma el árbol a partir de `parentCommentId`. Una respuesta cuyo padre pertenece a otro evento se trata como raíz.
- Los mensajes no cambian el estado de la operación. Un cambio de estado es un evento nuevo.

## 8. Logix (asistente)

- `logix-engine.ts` es un motor de reglas sobre los datos del tenant activo. No usa ningún modelo de lenguaje.
- El panel (`logix-assistant.tsx`) toma como contexto la operación abierta en `/operaciones/:id`.
- Fuera de desarrollo, el lanzador aparece deshabilitado como "próximamente". El motor no entra al bundle de producción.
- **Pendiente**: un servicio de consulta en FastAPI con controles de autorización. Hasta entonces, no debe afirmarse que Logix consulta datos reales de Logixtic.

## 9. Entornos y build

- `src/config/runtime.ts` define el modo: `local` (solo `vite dev`) y `blocked` (producción). `FEATURES` activa las funciones por entorno.
- En código de interfaz, la rama de desarrollo usa `import.meta.env.DEV` literal. El compilador elimina de producción los fixtures, el repositorio local, el selector de empresa de QA, el motor de Logix y el cliente de autenticación local.
- `npm run build` **falla** sin `VITE_AUTH_PROVIDER` (valor `supabase`), sin configuración pública de Supabase o con una clave con privilegios de servicio, y con una `VITE_API_BASE_URL` que no sea https absoluta o `/api/...` del mismo origen. Aun configurados, el acceso permanece bloqueado porque el proveedor no está implementado.
- `npm run build:verify` construye con valores de verificación y ejecuta `scripts/verify-bundle.mjs`, que falla si el bundle contiene cadenas de fixtures o de acceso local.

## 10. Carga y rendimiento

- Chunk principal: 481 kB (151 kB gzip) en el último build de verificación. Vite avisa por encima de 500 kB sin gzip.
- Inter se sirve desde el propio bundle; no hay peticiones a Google Fonts.

## 11. Limitaciones conocidas

- La API no está desplegada ni conectada a Supabase ni a Logixtic. Ninguna operación de Logixtic se procesa en sistemas externos.
- Las pantallas funcionan con datos sintéticos. El adaptador HTTP no está conectado y el modelo `Operation` del dominio requiere campos que la API v1 no expone (ver `docs/fastapi-integration.md`, sección 6).
- Los comentarios se consultan y crean contra la API solo en pruebas; el portal no los usa todavía.
- Los adjuntos (solicitudes y cargas documentales) solo se validan en el cliente; no se suben.
- La vista previa de documentos no está implementada.
- La navegación por teclado y el contraste se revisaron por código y con pruebas automatizadas parciales; no hay auditoría axe.
- Solo se verificó en Chromium.

## 12. Despliegue y migraciones (fase 08C)

- **Un servicio, un proceso.** `Dockerfile` (multi-etapa) compila `apps/web` con Node 22 y ejecuta FastAPI con Python 3.12 slim como usuario no root. FastAPI sirve `index.html`, `assets/` y el fallback SPA (`apps/api/app/web/spa.py`). Las rutas `/api/...` y `/health` nunca reciben HTML.
- **Mismo origen.** El frontend usa `VITE_API_BASE_URL=/api/v1`. No hay CORS en producción.
- **Servicios externos.** Supabase Auth (emite y firma los tokens) y Supabase PostgreSQL (datos y RLS). Storage queda para una fase posterior.
- **Migraciones.** Fuente canónica `supabase/migrations/` con Supabase CLI. Alembic (`apps/api/migrations`) es referencia histórica. Ver `docs/database-migration-strategy.md`.
- **Despliegue.** `render.yaml` define un Web Service Docker en plan gratuito, sin base de datos ni segundo servicio en Render. Ver `docs/deployment-render.md`.
- **Pool de base de datos.** Pequeño (`DATABASE_POOL_SIZE=2`, `DATABASE_MAX_OVERFLOW=0`) por el límite de 512 MB.

## 13. Política de datos reales

Regla permanente (ver `CLAUDE.md`): ningún dato ficticio ni respuesta simulada se presenta como información
real en presentación, staging o producción.

Clasificación de cada fuente de datos:

| Fuente | Dónde existe | Puede presentarse como real |
|---|---|---|
| Repositorio mock (`mock-repository.ts`) y fixtures | Solo `vite dev` | No. Es la opción activa **solo en desarrollo** y no forma parte del bundle de producción. |
| Login JSON local (`apps/web/local/`) | Solo `vite dev` | No. No es autenticación. |
| Motor de reglas de Logix | Solo desarrollo | No. Debe identificarse como respuesta local de desarrollo. |
| `supabase/seed.sql` | Bases desechables | No. Prohibido en presentación, staging y producción. |
| FastAPI + PostgreSQL de Supabase | Cuando estén configurados | Sí, tras verificación de cada flujo. |
| Logixtic (aplicación principal) | Pendiente de integración | Aún no hay fuente. Se muestra "información no disponible". |

**Estado actual de los pasos del orden de implementación:**

| Paso | Estado |
|---|---|
| 1. Estabilizar React + FastAPI | En curso: pruebas unitarias y de frontend pasan; integración con PostgreSQL pendiente de ejecutar. |
| 2. Validar Docker y el despliegue único | Pendiente: Dockerfile escrito, sin construir. |
| 3. Proyecto real de desarrollo en Supabase | Pendiente: sin proyecto configurado. |
| 4. Aplicar `supabase/migrations/` | Pendiente: sin ejecutar. |
| 5. Supabase Auth y PostgreSQL | Pendiente: módulos preparados; pantallas no conectadas. |
| 6. Sustituir mock y login JSON | Pendiente. Producción ya bloquea el acceso con datos no reales. |
| 7. Integrar Logixtic | Pendiente. Sin conexión ni contrato operativo confirmado. |
| 8. Logix con consultas reales | Pendiente. |
| 9. Flujos completos de extremo a extremo | Pendiente. |

**Comportamiento cuando falta una integración:** la pantalla muestra un estado explícito de información no
disponible, con el motivo. No se rellena con datos de ejemplo ni se oculta el problema.

**Trazabilidad:** hoy solo los comentarios se guardan en la base de datos, con autor, empresa y fecha. Decisiones
de cotización, solicitudes y adjuntos aún no tienen endpoint: mientras no exista persistencia real, no se muestran
como acciones completadas. Las pruebas automatizadas usan datos sintéticos en entornos aislados.
