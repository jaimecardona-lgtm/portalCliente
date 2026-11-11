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
| Local (mock) | Existe. Solo desarrollo. Carga diferida (`loadLocalRepository`). | `mock-repository.ts` |
| Remota (FastAPI) | **Pendiente.** Debe cumplir el mismo contrato. | — |

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

### Autenticación real — pendiente

Supabase Auth gestionará credenciales, recuperación por correo y sesiones. FastAPI validará el token en cada petición. Ver `docs/supabase-preparation.md`. Los contratos de tipo están en `src/services/auth/contracts.ts` (`AuthService`, `UserRepository`, `SessionService`, `TenantMembershipRepository`).

## 6. Aislamiento multi-tenant

| Capa | Mecanismo | Alcance real |
|---|---|---|
| Datos locales | Repositorio filtra por `tenantId` | Presentación. No es seguridad. |
| Caché del cliente | Claves de consulta con `tenantId` | Evita mostrar datos de otra empresa tras cambiar de empresa en QA. |
| Servidor local | Tenant y rol fijados por el servidor; cookie HttpOnly | Solo desarrollo. |
| FastAPI (futuro) | Tenant desde el token y la membresía, nunca desde la URL | **Obligatorio** antes de usuarios reales. |
| Base de datos (futuro) | Filtros por tenant y RLS | Pendiente. |

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
- `npm run build` **falla** sin `VITE_AUTH_PROVIDER` (valor `oidc`) y `VITE_API_BASE_URL` (URL https). Aun configurados, el acceso permanece bloqueado porque el proveedor no está implementado.
- `npm run build:verify` construye con valores de verificación y ejecuta `scripts/verify-bundle.mjs`, que falla si el bundle contiene cadenas de fixtures o de acceso local.

## 10. Carga y rendimiento

- Chunk principal: 481 kB (151 kB gzip) en el último build de verificación. Vite avisa por encima de 500 kB sin gzip.
- Inter se sirve desde el propio bundle; no hay peticiones a Google Fonts.

## 11. Limitaciones conocidas

- No hay backend real. Ninguna operación de Logixtic se procesa en sistemas externos.
- El repositorio remoto no existe. Las pantallas funcionan con datos sintéticos.
- Los adjuntos (solicitudes y cargas documentales) solo se validan en el cliente; no se suben.
- La vista previa de documentos no está implementada.
- La navegación por teclado y el contraste se revisaron por código y con pruebas automatizadas parciales; no hay auditoría axe.
- Solo se verificó en Chromium.
