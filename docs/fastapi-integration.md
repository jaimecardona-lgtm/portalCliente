# Integración futura con FastAPI — contratos previstos

**Estado: no implementado.** Este documento describe contratos previstos, no endpoints disponibles. Ningún endpoint descrito aquí existe todavía.

## 1. Cómo se conectará el frontend

1. Crear `createHttpRepository(baseUrl, auth)` en `apps/web/src/services/repositories/` que cumpla `PortalRepository`.
2. Añadir la rama `api` en `loadRemoteRepository` (hoy solo existe la carga local).
3. Sustituir la autenticación local por Supabase Auth en el cliente (ver `docs/supabase-preparation.md`). `SessionProvider` centraliza la sesión; cambia cómo se obtiene y renueva.
4. Retirar de producción los módulos de desarrollo. El build ya los excluye; `verify:bundle` debe seguir pasando.
5. Logix: sustituir `answerLogixQuestion` por una llamada autenticada al servicio de consulta (ver sección 6).

Las pantallas no deben cambiar: consumen `PortalRepository`.

## 2. Contratos previstos por repositorio

| Método del repositorio | Endpoint previsto | Notas |
|---|---|---|
| `listOperations(tenantId)` | `GET /operations` | Filtros por query: estado, tipo, transporte, rango, texto. |
| `getOperation` | `GET /operations/{id}` | 404 si no pertenece al tenant del token. |
| `listOperationEvents` | `GET /operations/{id}/events` | Orden cronológico. Solo eventos visibles al cliente. |
| `listEventComments` | `GET /operations/{id}/events/{event_id}/comments` | Sin comentarios internos para clientes. |
| `addEventComment` | `POST /operations/{id}/events/{event_id}/comments` | `parent_comment_id` opcional, del mismo evento. |
| `listDocuments` | `GET /documents` | Estado derivado de la vigencia. |
| `addDocumentVersion` | `POST /documents/{id}/versions` | Almacenamiento en Supabase Storage (ver sección 5). |
| `listQuotes`, `getQuote` | `GET /quotes`, `GET /quotes/{id}` | |
| `decideQuote` | `POST /quotes/{id}/decision` | Valida estado y vigencia en el servidor. |
| `listRequests` | `GET /requests` | |
| `createRequest` | `POST /requests` | Validación y adjuntos en el servidor. |
| `listAddresses`, `listContacts`, `getTenant` | `GET /tenant`, `GET /tenant/addresses`, `GET /tenant/contacts` | Datos de la empresa del token. |
| `getUser` / perfil | `GET /me`, `PATCH /me` | Solo el nombre es editable por el cliente. |

Convención: JSON en `snake_case` en el servidor; el cliente mapea a `camelCase`. Los tipos de `src/types/domain.ts` son la referencia.

## 3. Identidad, tenant y membresías

- El token de Supabase Auth identifica a la persona. FastAPI lo valida en cada petición.
- La empresa (`tenant_id`) se obtiene de la **membresía activa** de esa persona (tabla `tenant_memberships`), nunca de un parámetro de la URL o del cuerpo.
- Un usuario sin membresía activa recibe 403.
- El rol de la membresía determina los permisos (por ejemplo, el rol `Consulta` no decide cotizaciones).

## 4. Reglas de autorización obligatorias

En cada endpoint FastAPI debe cumplirse:

- Validar la identidad del token.
- Validar que el recurso pertenece al tenant de la membresía.
- Validar el permiso del rol para la acción.
- Excluir comentarios con `visibility = 'internal'` para usuarios cliente.
- Validar vigencia y estado antes de aceptar una decisión de cotización.
- Validar tipo, tamaño y contenido de los adjuntos en el servidor.
- No registrar contraseñas, tokens ni datos personales en logs.

El frontend no sustituye estas comprobaciones.

## 5. Documentos y adjuntos

- Almacenamiento previsto: Supabase Storage.
- Acceso mediante URLs firmadas de vida corta generadas por FastAPI. Los buckets no son públicos.
- Subida: el cliente envía el archivo al servidor, que valida tipo y tamaño antes de almacenarlo.

## 6. Logix

Contrato previsto:

- `POST /assistant/query` con `{ "question": string, "operation_id"?: string }`.
- El tenant se deriva del token. El servidor solo puede consultar datos del tenant de la membresía.
- Respuesta: texto y, opcionalmente, identificadores de operaciones referenciadas.
- Si no hay información disponible, debe responder que no está disponible.

Hasta implementar este servicio, Logix funciona solo en desarrollo, con reglas sobre datos sintéticos.

## 7. Datos que se consultan desde Logixtic y datos propios del portal

| Dato | Origen previsto |
|---|---|
| Operaciones (DO), estados, fechas y responsables logísticos | Logixtic (fuente de verdad). Sincronización a definir. |
| Eventos de seguimiento | Logixtic |
| Documentos oficiales y sus vigencias | Logixtic o almacenamiento del portal, según el caso (a definir). |
| Cotizaciones emitidas | Logixtic |
| Empresas, usuarios, membresías y permisos del portal | Portal (Supabase PostgreSQL) |
| Comentarios y respuestas de clientes | Portal |
| Solicitudes de clientes | Portal |
| Preferencias de la cuenta, aceptación de términos | Portal |

**Pendiente de definir con Logixtic:** la forma de sincronización (consulta bajo demanda o replicación), la fuente de verdad de cada estado y el tratamiento de cambios concurrentes.

## 8. Criterios antes de exponer el backend

- Todos los endpoints con pruebas de autorización por rol y por tenant.
- Pruebas de regresión del contrato con el repositorio local.
- Auditoría de seguridad de las rutas.
- Registro de accesos sin datos personales.
