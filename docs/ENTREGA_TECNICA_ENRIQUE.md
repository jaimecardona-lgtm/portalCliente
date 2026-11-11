# Entrega técnica — Portal de Clientes Logixtic

**Para:** Enrique (revisión técnica del frontend y de la integración con backend)
**Repositorio:** `portalCliente` · rama `feat/client-portal-v1` (commits locales, sin push)
**Estado en una frase:** interfaz completa y revisada visualmente, con datos sintéticos. **No tiene autenticación real ni conexión a Logixtic. No debe usarse con clientes reales hasta cumplir la sección 11.**

---

## 1. Arquitectura frontend

Aplicación SPA en `apps/web`. Capas, de arriba abajo:

```
Páginas y componentes (src/features/*, src/layouts, src/components)
        │  useRepository() · useSession() · tenantKey()
        ▼
Repositorio tipado (src/services/repositories/portal-repository.ts)
        │
        ├── Repositorio local (mock-repository.ts) — solo desarrollo, carga diferida
        └── Repositorio remoto — PENDIENTE (FastAPI)
```

- **Entornos explícitos** (`src/config/runtime.ts`):
  - `local`: solo en `vite dev`. Usa datos sintéticos y un acceso de presentación.
  - `blocked`: el build de producción. Sin proveedor de identidad real, no concede acceso.
- **Guarda de acceso** en `beforeLoad` del layout autenticado (`src/routes/router.tsx`). Sin acceso habilitado, ninguna pantalla autenticada se monta.
- **Funciones por entorno** (`buildFeatures`): en producción todas las funciones sensibles o incompletas quedan desactivadas.
- **Código de presentación excluido de producción**: `import.meta.env.DEV` se sustituye en el build, y los módulos de fixtures, el repositorio local, el selector de empresa y el motor de Logix no entran al bundle. Se verifica con `npm run verify:bundle` (ver sección 12).
- **Control de texto visible**: `src/test/visible-copy.test.ts` falla si aparecen términos de prototipo o demostración en la interfaz.

## 2. Stack tecnológico

| Área | Tecnología | Versión instalada |
|---|---|---|
| Build | Vite | 8.3.8 |
| Lenguaje | TypeScript estricto | 7.0.2 |
| UI | React | 19.3.1 |
| Rutas | TanStack Router (code-based) | 1.170.46 |
| Datos | TanStack Query | 5.107.1 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) | 4.3.5 |
| Iconos | lucide-react | 1.72.0 |
| Formularios | React Hook Form + Zod | 7.92.0 / 4.6.7 |
| Tipografía | Inter autohospedada (`@fontsource-variable/inter`) | 5.3.x |
| Pruebas unitarias | Vitest + Testing Library + jsdom | 5.1.0 / 16.3.3 / 31.0.0 |
| Pruebas E2E | Playwright Test | 1.65.x |

Versiones exactas en `apps/web/package-lock.json`.

## 3. Módulos implementados

| Módulo | Ruta | Estado |
|---|---|---|
| Login | `/login` | Diseño final. Acceso local en desarrollo; producción bloqueada. |
| Torre de control | `/` | Indicadores, seguimiento por ETA, alertas, rutas, actividad. Calculado sobre datos del tenant. |
| Operaciones | `/operaciones` | Filtros y búsqueda en la URL, columnas configurables, orden, vista de tarjetas en móvil. |
| Detalle DO | `/operaciones/:id` | Cabecera con ruta y progreso, timeline por evento, hilos de conversación por evento. |
| Documentos | `/documentos` | Vigentes, por vencer, vencidos; búsqueda; historial. Carga y vista previa solo local. |
| Cotizaciones | `/cotizaciones`, `/cotizaciones/:id` | Listado y detalle. Decisión solo si el estado y la vigencia lo permiten, y solo local. |
| Solicitudes | `/solicitudes`, `/solicitudes/nueva` | Historial. Formulario validado; envío solo local. |
| Información de cuenta | `/cuenta` | Solo lectura. Los cambios se solicitan por solicitud. |
| Marketplace | `/marketplace` | Solo local. En producción la ruta responde como no encontrada. |
| Asistente Logix | Panel en la shell | Motor de reglas solo local. En producción, lanzador deshabilitado. |

## 4. Funcionalidades de desarrollo local

Existen únicamente en `vite dev`. **No están presentes en el build de producción.**

- **Acceso de presentación** con usuarios sintéticos (ver sección 12, credenciales para el equipo técnico).
- **Repositorio local** con fixtures sintéticos (`src/data/fixtures/demo-data.ts`) y latencia simulada para estados de carga.
- **Selector de empresa de QA** en la barra superior, etiquetado "Entorno local". Permite revisar el aislamiento entre empresas.
- **Motor de reglas de Logix** sobre los datos locales del tenant activo. No es un modelo de lenguaje.
- **Decisiones de cotización, envío de solicitudes y cargas documentales**: se registran solo en memoria. Se pierden al recargar. No generan transacciones ni notifican a nadie.

## 5. Funcionalidades que requieren backend

Ninguna de las siguientes funciones existe en producción hasta implementar el backend:

- Autenticación real, gestión de sesión y renovación de tokens.
- Lectura de operaciones, eventos, comentarios, documentos, cotizaciones, solicitudes y empresa desde FastAPI.
- Persistencia de comentarios y respuestas.
- Decisiones de cotización que generen efecto comercial.
- Envío de solicitudes, con adjuntos almacenados de forma segura.
- Carga y versionado de documentos, con almacenamiento y vista previa.
- Asistente Logix conectado al backend, con controles de autorización.
- Recuperación de contraseña.
- Marketplace.

## 6. Estado de autenticación

- **No existe autenticación real** en el frontend.
- **Desarrollo**: acceso de presentación contra usuarios sintéticos. Su contraseña no es un secreto y no protege nada.
- **Producción**: `npm run build` falla si faltan `VITE_AUTH_PROVIDER` (valor `oidc`) y `VITE_API_BASE_URL` (URL https). Aunque la configuración esté completa, el acceso queda bloqueado porque el proveedor `oidc` **aún no está implementado** (`IMPLEMENTED_AUTH_PROVIDERS` está vacío en `src/config/runtime.ts`).
- Ninguna sesión guardada en el navegador concede acceso en producción. La clave de sesión no es una prueba de identidad: FastAPI debe validar el token en cada petición.

## 7. Estado de integración con Logixtic

- **Sin integración.** No hay conexión con sistemas productivos, ERP, TMS, facturación ni con el sitio corporativo.
- El frontend no envía datos a ningún servicio externo. No hay llamadas a APIs de IA.
- Las "alertas" y "progreso" se calculan a partir de los datos que se le entreguen. No hay seguimiento en tiempo real.
- Los textos de la interfaz evitan afirmar seguimiento en tiempo real o consultas a sistemas que aún no existen.

## 8. Modelo multi-tenant

- Todo modelo de dominio lleva `tenantId` (`src/types/domain.ts`).
- Todas las lecturas del repositorio reciben `tenantId` y filtran por él. Un ID de otra empresa devuelve `null` o lista vacía.
- Las claves de caché de TanStack Query incluyen `tenantId` (`tenantKey`), así la caché no mezcla empresas.
- Las pruebas verifican que un DO de otra empresa no es accesible por URL, que los adjuntos y eventos ajenos no se devuelven, y que no es posible comentar sobre un evento de otro tenant.
- **Limitación**: el aislamiento del frontend es de presentación. No es seguridad. FastAPI debe determinar el tenant a partir del token, nunca de un parámetro de la URL.

## 9. Contratos previstos para FastAPI

El frontend consume un contrato tipado (`PortalRepository`). Cada método debe mapearse a un endpoint. Ver el detalle en `docs/fastapi-integration.md`.

| Método del repositorio | Endpoint previsto |
|---|---|
| `listOperations` | `GET /operations` |
| `getOperation` | `GET /operations/{id}` (404 si no pertenece al tenant) |
| `listOperationEvents` | `GET /operations/{id}/events` |
| `listEventComments` | `GET /operations/{id}/events/{eventId}/comments` |
| `addEventComment` | `POST /operations/{id}/events/{eventId}/comments` |
| `listDocuments`, `addDocumentVersion` | `GET /documents`, `POST /documents/{id}/versions` |
| `listQuotes`, `decideQuote` | `GET /quotes`, `POST /quotes/{id}/decision` |
| `listRequests`, `createRequest` | `GET /requests`, `POST /requests` |
| `getUser`, `getTenant`, `listAddresses`, `listContacts` | `GET /me`, `GET /tenant`, `GET /tenant/addresses`, `GET /tenant/contacts` |

Los campos se mapean de `snake_case` (FastAPI) a `camelCase` (cliente).

## 10. Modelo de eventos y comentarios anidados

**Evento** (`OperationEvent`): identificador, operación, tenant, fecha y hora, autor, tipo (`status_change`, `news`, `document`, `action_required`), estado anterior y nuevo cuando aplica, título, descripción, adjuntos y visibilidad.

**Comentario** (`EventComment`): `id`, `tenant_id`, `operation_id`, `event_id`, `parent_comment_id`, `author_id`, `body`, `created_at`, `visibility`.

Reglas, todas cubiertas por pruebas:

1. Todo comentario pertenece a un evento. No existe una pestaña general de comentarios.
2. Las respuestas usan `parent_comment_id` y se muestran anidadas.
3. Un comentario o respuesta **no cambia el estado** de la operación.
4. Un cambio de estado crea un evento nuevo; el historial no se sobrescribe.
5. Los comentarios con `visibility = internal` no se devuelven a clientes.
6. Un comentario cuyo padre pertenece a otro evento se rechaza.
7. Los hilos de distintos eventos o empresas están completamente separados.

## 11. Requisitos antes de habilitar usuarios reales

Ninguno de estos puntos está resuelto hoy:

- [ ] Proveedor de identidad elegido e implementado en el frontend (flujo OIDC o equivalente), con cierre de sesión y renovación de tokens.
- [ ] FastAPI validando identidad, pertenencia a tenant y permisos **en cada endpoint y en cada acceso a recurso**.
- [ ] Repositorio remoto implementado y verificado contra los contratos de la sección 9.
- [ ] Eliminación del acceso de presentación de cualquier ruta compartida (ya excluido del build de producción).
- [ ] Persistencia real de comentarios, solicitudes, decisiones de cotización y versiones documentales, con auditoría.
- [ ] Almacenamiento de adjuntos con validación de tipo y tamaño en el servidor y análisis antimalware.
- [ ] Revisión de seguridad (OWASP ASVS) y pruebas de autorización por rol y tenant contra la API.
- [ ] Auditoría de accesibilidad automatizada (axe) y revisión manual con lectores de pantalla.
- [ ] Política de contraseñas, bloqueo por intentos y recuperación de acceso gestionada por el proveedor.
- [ ] Textos legales, política de privacidad y tratamiento de datos personales de contactos.
- [ ] Monitoreo de errores en producción sin enviar datos personales.
- [ ] Pruebas E2E contra un entorno de staging con datos no productivos.
- [ ] Reducción del chunk principal (481 kB sin gzip; ver sección 13).

## 12. Comandos de instalación, pruebas y ejecución

Desde `apps/web`:

```bash
npm install                  # instalar dependencias
npm run dev                  # desarrollo en http://127.0.0.1:5173
npm run typecheck            # TypeScript estricto
npm test                     # pruebas unitarias (Vitest)
npm run test:e2e             # E2E de presentación (escritorio y móvil)
npm run build                # build de producción: FALLA sin configuración real (es intencional)
npm run build:verify         # build con configuración de verificación + inspección del bundle
npm run verify:bundle        # solo inspección de dist/ (después de un build)
npm run test:e2e:prod        # E2E del build de producción (requiere build:verify)
```

Para ejecutar E2E con Chrome instalado en el equipo, anteponer `PW_CHANNEL=chrome`. Sin esa variable, `npx playwright install chromium`.

### Configuración de producción

| Variable | Valor | Obligatoria |
|---|---|---|
| `VITE_AUTH_PROVIDER` | `oidc` (único valor permitido hoy) | Sí |
| `VITE_API_BASE_URL` | URL https de la API FastAPI | Sí |

### Usuario local de revisión (fase 04)

Acceso de revisión para una persona concreta, solo en `vite dev` y solo desde localhost:

- Se configura con `npm run setup:local-user`. La contraseña se pide sin mostrarla y se guarda como hash scrypt con sal en `apps/web/local/reviewer.config.json` (ignorado por Git).
- La verificación ocurre en el servidor de desarrollo mediante un middleware que no existe en el build (`configureServer` solo se ejecuta con `vite dev`). Las peticiones de otro origen se rechazan. Tras 5 intentos fallidos, el acceso se bloquea 60 segundos.
- El usuario queda asignado a una empresa sintética (Textiles Andinos) con rol operativo. No tiene permisos administrativos.
- **No es un mecanismo de autenticación seguro.** No debe usarse con clientes reales ni desplegarse.
- La contraseña nunca se escribe en código, fixtures, variables `VITE_*`, documentación ni Git.

Preparación para Supabase (Auth, `profiles`, `tenants`, `tenant_memberships`, Storage) en `docs/supabase-preparation.md`. No hay conexión ni migraciones.

### Credenciales de presentación local (**solo equipo técnico**)

Válidas únicamente en `vite dev`. No existen en el build de producción. Son datos sintéticos.

| Empresa (sintética) | Correo | Contraseña |
|---|---|---|
| Textiles Andinos S.A.S. | `ana.torres@textilesandinos.example` | `Demo-2026` |
| Agroexport Pacífico Ltda. | `carla.nino@agroexport-pacifico.example` | `Demo-2026` |

La contraseña no es un secreto ni protege datos reales. No debe reutilizarse en ningún otro entorno.

---

## Anexo A. Verificación realizada en esta entrega

Resultados reales, ejecutados el día de la entrega. Ver `docs/validation.md` para el detalle.

- `npm run typecheck`: sin errores.
- `npm test`: 8 archivos, 61 pruebas aprobadas.
- `npm run build:verify`: build correcto y bundle sin datos sintéticos ni autenticación local (18 archivos).
- `npm run test:e2e` (presentación): 55 aprobadas, 1 omitida por diseño (selector de empresa visible desde 1280 px).
- `npm run test:e2e:prod`: 14 aprobadas. Confirman que el login de producción no muestra cuentas ni contraseñas, que las rutas protegidas redirigen, que el acceso con credenciales sintéticas no crea sesión, y que no hay errores de consola.

## Anexo B. Limitaciones conocidas

- El chunk principal pesa 481 kB (151 kB gzip). Vite avisa por encima de 500 kB sin gzip.
- Solo se verificó en Chromium.
- No hay auditoría automatizada de accesibilidad (axe).
- Las capturas de esta entrega provienen del entorno de desarrollo; incluyen el selector de empresa de QA. La producción no puede capturarse hasta contar con backend.
- Carga de archivos y vistas previas no están implementadas fuera de la presentación local.
