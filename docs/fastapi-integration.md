# Integración futura con FastAPI

El frontend ya separa la fuente de datos tras `PortalRepository`. Para conectar el backend no hay que reescribir componentes; basta con implementar la misma interfaz contra HTTP.

## Pasos

1. **Implementar `createHttpRepository(baseUrl, auth)`** en `apps/web/src/services/repositories/` cumpliendo `PortalRepository`.
2. **Activar `'api'`** en `createRepository` (hoy lanza error explícito).
3. **Sustituir `authenticateDemo`** por un flujo real con tokens. `SessionProvider` ya centraliza la sesión; solo cambia cómo se obtiene y renueva.
4. **Retirar** `DEMO_PASSWORD`, `demo-data.ts` de rutas de producción y el selector SIMULACIÓN (o dejarlo solo en builds DEMO).
5. **Logix**: reemplazar `answerLogixQuestion` por una llamada `POST /assistant/query` con `tenant` implícito en el token y `operationId` opcional.

## Contrato esperado por endpoint

| Repositorio | Endpoint sugerido |
|---|---|
| `listOperations` | `GET /operations?status=&kind=&from=&to=&q=` |
| `getOperation` | `GET /operations/{id}` (404 si no pertenece al tenant) |
| `listOperationEvents` | `GET /operations/{id}/events` |
| `listEventComments` | `GET /operations/{id}/events/{eventId}/comments` |
| `addEventComment` | `POST /operations/{id}/events/{eventId}/comments` (`parent_comment_id` opcional) |
| `listDocuments`, `addDocumentVersion` | `GET /documents`, `POST /documents/{id}/versions` |
| `decideQuote` | `POST /quotes/{id}/decision` |
| `createRequest` | `POST /requests` |

Los campos en JSON deben usar `snake_case` en FastAPI y mapearse a camelCase en el cliente; los tipos de `domain.ts` son el contrato de referencia.

## Responsabilidades de FastAPI (obligatorias)

El aislamiento del frontend **no es seguridad**. En cada endpoint FastAPI debe:

- validar la identidad del token;
- validar que el recurso pertenece al `tenant_id` de ese token (no del parámetro de la URL);
- validar permisos por rol (por ejemplo, `Consulta` no decide cotizaciones);
- excluir comentarios `visibility = 'internal'` a usuarios cliente;
- validar vigencia y estado antes de aceptar una decisión de cotización;
- aplicar límites y validación de tipo a adjuntos en el servidor.
