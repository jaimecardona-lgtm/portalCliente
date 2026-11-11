# Integración con FastAPI — estado real y contratos previstos

Este documento separa tres cosas que antes se mezclaban:

1. **Implementado y probado**: endpoints que existen en `apps/api` y pasan pruebas.
2. **Adaptador frontend preparado, no conectado**: `apps/web/src/services/api/`.
3. **Previsto**: contratos que aún no existen en ninguna capa.

> **Estado de la integración:** la API responde en local contra PostgreSQL. **No está conectada a Supabase
> Auth ni a Supabase PostgreSQL**, no está desplegada y **las pantallas siguen usando el repositorio mock**.
> El inicio de sesión de desarrollo (JSON local) no envía credenciales a la API.

## 1. Transición en tres ejes

| Eje | Hoy (desarrollo) | Destino | Qué cambia en el código | Qué no cambia |
|---|---|---|---|---|
| Autenticación | JSON local (`apps/web/local/auth/`) con cookie de sesión del servidor de Vite | Supabase Auth (correo y contraseña, JWT) | La API ya verifica JWT de Supabase (`app/core/security.py`). El frontend tendrá que obtener el token de Supabase y entregarlo a `createApiClient({ getToken })`. | Las rutas de `/login` y `/registro` y los contratos de `src/services/auth/contracts.ts`. |
| Datos | Repositorio mock (`mock-repository.ts`, datos sintéticos) | FastAPI (`/api/v1`) mediante `HttpPortalRepository` | Se añadirá `loadRemoteRepository()` en `src/services/repositories/index.ts` y una rama que lo elija. | Las pantallas consumen `PortalRepository` y no cambian. |
| Base de datos | PostgreSQL 18 local (`portal_test`) con migraciones 0001 y 0002 | Supabase PostgreSQL | Solo la cadena de conexión `DATABASE_URL` y los secretos de Supabase. | Esquema, RLS y rol `portal_app`, siempre que la migración se aplique igual. |

**Qué se queda como está hasta que exista identidad real:** el repositorio mock sigue siendo la opción de
desarrollo. `HttpPortalRepository` existe y tiene pruebas, pero ninguna ruta de la aplicación lo usa.

## 2. Endpoints implementados (`apps/api/app/api/v1.py`)

Base: `http://127.0.0.1:8000` en desarrollo. Todas las rutas salvo `/health` exigen
`Authorization: Bearer <token de Supabase>`.

| Método | Ruta | Devuelve | Roles | Errores documentados |
|---|---|---|---|---|
| GET | `/health` | Estado y versión | Pública | — |
| GET | `/api/v1/me` | Persona, empresa activa, rol, `can_comment` y membresías | Cualquier membresía activa | 400, 401, 403, 422, 503 |
| GET | `/api/v1/tenants/current` | Id, slug y razón social de la empresa activa | Cualquier membresía activa | 400, 401, 403, 422, 503 |
| GET | `/api/v1/operations?limit&offset` | Referencias de operación de la empresa | Cualquier membresía activa | 400, 401, 403, 422, 503 |
| GET | `/api/v1/operations/{id}` | Detalle de referencia de operación | Cualquier membresía activa | + 404 |
| GET | `/api/v1/operations/{id}/events` | Eventos con `visibility = client` | Cualquier membresía activa | + 404 |
| GET | `/api/v1/operations/{id}/events/{event_id}/comments` | Comentarios visibles del evento (incluye respuestas con `parent_comment_id`) | Cualquier membresía activa | + 404 |
| POST | `/api/v1/operations/{id}/events/{event_id}/comments` | Crea comentario o respuesta (201) | `client_admin`, `client_member` | + 404 (y 403 `role_cannot_comment`) |

Documentación interactiva: `/docs` y `/openapi.json` existen fuera de producción. En producción están
desactivadas salvo que `DOCS_ENABLED=true` se indique de forma explícita.

### Campos que la API no devuelve (por diseño)

- `author_id` de los comentarios. El autor se identifica por `author_name` y `author_side`.
- Identificadores externos de Logixtic (`external_id`, `external_event_id`).
- Rutas de almacenamiento de adjuntos.
- Comentarios y eventos con `visibility = internal`.

Las pruebas de integración comprueban los identificadores externos, las rutas de almacenamiento y los
comentarios internos. La ausencia de `author_id` la fija el esquema de respuesta (`CommentOut`), no una prueba específica.

## 3. Formato de error

Todos los errores usan el mismo sobre (`app/core/errors.py`, esquema `ErrorEnvelope` en OpenAPI):

```json
{"error": {"code": "operation_not_found", "message": "La operación no existe.", "request_id": "3f9c..."}}
```

| Código | HTTP | Significado |
|---|---|---|
| `authentication_required` | 401 | Falta el token o no es Bearer. |
| `invalid_token` | 401 | Firma, emisor, audiencia, caducidad o rol (`authenticated`) no válidos. |
| `no_tenant_membership` | 403 | La persona no tiene empresas activas. |
| `tenant_selection_required` | 400 | Tiene varias empresas y no envió `X-Tenant-Id`. |
| `tenant_not_authorized` | 403 | `X-Tenant-Id` apunta a una empresa que no es suya. |
| `tenant_inactive` / `profile_inactive` | 403 | Empresa suspendida o perfil deshabilitado. |
| `role_cannot_comment` | 403 | Rol `client_viewer`. |
| `operation_not_found` / `event_not_found` / `parent_comment_not_found` | 404 | Inexistente **o de otra empresa**: la respuesta es idéntica. |
| `validation_error` | 422 | Solo ubicación y tipo del error; nunca el valor enviado. |
| `auth_not_configured` | 503 | Falta `SUPABASE_URL` y secreto o JWKS. Nunca se simula un inicio de sesión. |
| `internal_error` | 500 | Error no controlado. Se registra el tipo, no el mensaje. |

## 4. Cabeceras y selección de empresa

- `X-Tenant-Id: <uuid>` solo se usa si la persona tiene varias membresías. El servidor acepta únicamente
  membresías existentes y nunca crea ninguna.
- Con una sola membresía, la empresa sale de la base de datos y la cabecera se ignora.
- Un cliente no puede fijar tenant, rol, autor ni lado en el cuerpo de una petición: `CommentCreate` tiene
  `extra="forbid"`, así que cualquier campo extra responde 422.

## 5. Adaptador frontend (`apps/web/src/services/api/`)

| Archivo | Responsabilidad |
|---|---|
| `http-client.ts` | Cliente tipado. Validación de la URL base (http/https, sin credenciales), token inyectado (sin token no hay petición), `credentials: 'omit'`, tiempo de espera de 15 s, `PortalApiError` con código y `requestId`. |
| `api-types.ts` | Forma exacta de las respuestas en `snake_case`. |
| `mappers.ts` | Validación en tiempo de ejecución y conversión a `camelCase`. Un estado o tipo desconocido, o un campo ausente, es `invalid_response`. |
| `http-portal-repository.ts` | `createHttpPortalRepository()`: implementa `PortalRepository`. |

Uso previsto (cuando exista identidad real):

```ts
const repo = createHttpPortalRepository({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getToken: async () => supabaseSession?.access_token ?? null,
  selectedTenantId: undefined, // solo si el usuario tiene varias empresas
})
```

### Comportamiento del repositorio

- **Empresa activa**: se resuelve con `GET /me` y se cachea. Un `tenantId` distinto de la empresa activa
  devuelve `null` o `[]` **sin salir a la red**.
- **Identificadores**: un id que no es UUID se trata como inexistente y no se envía.
- **Escrituras**: `addEventComment` envía solo `{ body, parent_comment_id }`. `authorId`, `authorName` y
  `authorSide` del llamador se ignoran.
- **Comentarios internos**: `listEventComments(..., { includeInternal: true })` rechaza con
  `not_available_in_api`, porque la API nunca los devuelve al portal.
- **Errores de `/me`**: no se cachean. La siguiente llamada vuelve a consultar al servidor.

### Métodos del contrato que la API v1 no cubre

Rechazan con `PortalApiError` de código `not_available_in_api` y **no devuelven datos de relleno**:

`getTenant`, `listTenants`, `listUsers`, `getUser`, `listAddresses`, `listContacts`, `listOperations`,
`getOperation`, `listAttachments`, `getAttachment`, `listDocuments`, `getDocument`, `addDocumentVersion`,
`listQuotes`, `getQuote`, `decideQuote`, `listRequests`, `createRequest`.

Para operaciones existen `listOperationSummaries` y `getOperationSummary`, que devuelven lo que la API expone.

## 6. Brechas entre el dominio del frontend y la API (bloqueantes)

Estas brechas explican por qué las pantallas no pueden conectarse todavía. No se resuelven en el cliente.

| Modelo del dominio | Problema | Qué hace falta |
|---|---|---|
| `Operation` | Exige `kind`, `transport`, `origin`, `destination`, `etd/eta/atd/ata`, `owner`, `booking`, `freeDays`, etc. La tabla `operation_refs` solo guarda `do_number`, `reference` y `last_known_status`. | Decidir la fuente de estos datos con Logixtic (sincronización) y ampliar `operation_refs` y la API, **o** ajustar el modelo del dominio a lo que el portal de verdad muestra. |
| `Tenant` | Exige `shortName`, `taxId`, `country`, `city`, `segment`, `accountManager`, `accent`. La API devuelve id, slug y razón social. | Ampliar `/tenants/current` o acordar qué campos son públicos para el cliente. |
| `User` | Exige `role` de la interfaz y `demoPassword`. | No debe existir en la API. El perfil lo cubre `/me`. Eliminar `demoPassword` del modelo antes de conectar. |
| `EventComment.authorId` | La API no devuelve `author_id` por decisión de privacidad. | Mantener la decisión y ajustar la UI, o exponer un identificador opaco. |
| `OperationEvent.attachmentIds` | La API no expone adjuntos de eventos. | Endpoint de adjuntos (pendiente). |
| Documentos, cotizaciones, solicitudes, direcciones, contactos | No hay endpoints ni tablas de dominio (salvo `requests` y `attachments` sin API). | Endpoints con pruebas de autorización por rol. |
| Logix | Sin servicio. El asistente funciona solo con reglas locales. | `POST /assistant/query` con las mismas reglas de tenant (ver sección 9). |

## 7. Identidad, tenant y membresías (implementado)

1. La API verifica el JWT: firma (HS256 con secreto o RS256/ES256 con JWKS), emisor `<SUPABASE_URL>/auth/v1`,
   audiencia `authenticated`, caducidad con margen configurable y `role = authenticated`.
2. Lee las membresías activas de la persona **bajo RLS**, con el rol `portal_app`.
3. Elige la empresa según `X-Tenant-Id` o la única membresía. Sin membresía: 403.
4. Comprueba que la empresa y el perfil estén activos.
5. Todas las consultas filtran por `tenant_id` y, además, PostgreSQL aplica RLS.

## 8. Reglas de autorización

| Regla | Dónde se aplica | Estado |
|---|---|---|
| Identidad verificada en cada petición | `app/core/security.py` | Implementado |
| Recurso de otra empresa = inexistente (404 idéntico) | `repositories/portal.py`, `api/v1.py` | Implementado y probado |
| Rol mínimo para comentar | `services/access.py` (`COMMENT_ROLES`) y RLS `event_comments_member_insert` | Implementado y probado |
| Comentarios y eventos internos fuera de la API | Consultas con `visibility = 'client'` y RLS | Implementado y probado |
| Respuestas del mismo evento y empresa | Servicio + clave compuesta `(parent_comment_id, tenant_id, event_id)` | Implementado y probado |
| Un comentario no cambia el estado de la operación | `services/comments.py` no escribe en `operation_refs` | Implementado y probado |
| Autor, lado y empresa fijados por el servidor | `services/comments.py` | Implementado y probado |
| Validación de vigencia y estado en decisiones de cotización | — | Previsto (sin endpoint) |
| Validación de tipo, tamaño y contenido de adjuntos | Restricciones SQL del esquema; sin endpoint de subida | Previsto |

## 9. Previsto (no existe)

| Método del repositorio | Endpoint previsto | Notas |
|---|---|---|
| `listDocuments`, `getDocument` | `GET /documents`, `GET /documents/{id}` | Estado derivado de la vigencia. |
| `addDocumentVersion` | `POST /documents/{id}/versions` | Almacenamiento en Supabase Storage con URL firmada. |
| `listQuotes`, `getQuote` | `GET /quotes`, `GET /quotes/{id}` | |
| `decideQuote` | `POST /quotes/{id}/decision` | Valida estado y vigencia en el servidor. |
| `listRequests`, `createRequest` | `GET /requests`, `POST /requests` | La tabla existe; falta la API. |
| `listAttachments`, `getAttachment` | `POST /attachments`, `GET /attachments/{id}/url` | URL firmada de vida corta. |
| `getUser` / perfil | `PATCH /me` | Solo el nombre es editable por el cliente. |
| Logix | `POST /assistant/query` | `{ "question": string, "operation_id"?: string }`. |

Convención: JSON en `snake_case` en el servidor; el cliente mapea a `camelCase`.

## 10. Datos de Logixtic y datos propios del portal

| Dato | Origen | Estado |
|---|---|---|
| Referencias de operación (`do_number`, referencia, último estado) | Logixtic | Tabla `operation_refs`. **Sin proceso de sincronización.** |
| Eventos de seguimiento | Logixtic | Tabla `operation_events`. **Sin sincronización.** |
| Documentos oficiales, cotizaciones emitidas | Logixtic | Sin esquema. |
| Empresas, perfiles, membresías | Portal | Tablas `tenants`, `profiles`, `tenant_memberships`. Sin proceso de aprovisionamiento. |
| Comentarios, solicitudes, adjuntos | Portal | Comentarios implementados. Solicitudes y adjuntos sin API. |

**Pendiente con Logixtic:** forma de sincronización (consulta o replicación), fuente de verdad de cada
estado y tratamiento de cambios simultáneos.

## 11. Puertos y configuración local

| Servicio | Puerto | Fuente |
|---|---|---|
| Frontend (Vite) | 5173 | `apps/web/vite.config.ts` |
| API FastAPI | 8000 | `apps/api/README.md` |
| PostgreSQL local | 5432 | `apps/api/.env.example`, `README.md` |

- La API acepta CORS solo desde `CORS_ALLOWED_ORIGINS` (por defecto, `127.0.0.1:5173` y `localhost:5173`).
- Para usar la API desde el frontend en desarrollo: `VITE_API_BASE_URL=http://127.0.0.1:8000`. En producción,
  el build exige `https://`.
- No hay cliente de Supabase CLI local en esta fase: la base de pruebas es PostgreSQL directo.

## 12. Criterios antes de exponer el backend a usuarios reales

- Proyecto de Supabase real configurado y migraciones aplicadas tras revisión (ver `docs/supabase-preparation.md`).
- Brechas de la sección 6 resueltas o aceptadas por escrito.
- Pruebas de autorización por rol y por empresa para cada endpoint nuevo.
- Registro de accesos sin datos personales (el logger ya redacta claves sensibles).
- Revisión de seguridad de las rutas y de las políticas RLS.
