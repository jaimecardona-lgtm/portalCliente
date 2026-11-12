# Agente Logix: arquitectura, decisiones pendientes y criterios de aceptación

**Estado:** propuesta. Ninguna parte de Logix con modelos reales está implementada ni activa.
La configuración (`apps/api/app/core/config.py`) existe con todo desactivado por defecto.

## 1. Orden de trabajo (directiva de arquitectura)

1. **Supabase Auth real y primer usuario validado.** Requiere pasos manuales del responsable (`docs/supabase-primer-acceso.md`).
   Bloquea todo lo siguiente.
2. Cliente OpenRouter en FastAPI, con pruebas y sin datos reales.
3. Migración RAG nueva en `supabase/migrations/` (pgvector, fuentes, fragmentos, sesiones, mensajes, auditoría).
   **Bloqueada** por la elección del modelo de embeddings: la dimensión de la columna depende de él.
4. Herramientas de consulta de operaciones y documentos con identidad validada por FastAPI.
5. Frontend del asistente conectado a FastAPI.
6. Pruebas E2E de seguridad, precisión y aislamiento.

## 2. Decisiones que requieren al responsable

| # | Decisión | Por qué no puede decidirla el agente |
|---|---|---|
| D1 | **Autorizar** el envío de datos del portal a OpenRouter (qué datos y a qué proveedor final) | Es una decisión contractual y de privacidad de la empresa. Sin ella `LOGIX_EXTERNAL_PROCESSING_AUTHORIZED` no puede ser `true`. |
| D2 | Política de retención del proveedor: Zero Data Retention y restricciones de entrenamiento | Depende de la cuenta y del contrato con OpenRouter y del proveedor final del modelo. |
| D3 | Modelo conversacional | Hay que verificar disponibilidad actual, precio, soporte de herramientas y ubicación de procesamiento. Se propone verificarlo con documentación del proveedor antes de fijarlo. |
| D4 | Modelo de embeddings y **dimensión** | La columna `vector(N)` se fija en la migración. Cambiar de modelo después implica re-vectorizar todo el corpus. |
| D5 | Presupuesto diario y límites por usuario | Son decisiones de coste. Valores por defecto propuestos: 5 USD/día, 30 consultas por hora y usuario. |

**Recomendación:** no activar ningún modelo hasta cerrar D1 y D2. Con D1 pendiente, el código puede existir pero no llamar al proveedor.

## 3. Clasificación de datos antes de enviar nada a OpenRouter

| Clase | Ejemplos | ¿Puede salir del servidor? |
|---|---|---|
| Pública | Textos legales, manual del portal | Sí, si D1 está autorizada |
| Operativa de la empresa cliente | Estado de operación, fechas, referencias de contenedor | Solo con D1 y minimizada (sin campos innecesarios) |
| Personal | Nombre, correo, teléfono de personas | No. Se sustituye por identificadores opacos antes de cualquier envío |
| Sensible o de otra empresa | Comentarios internos, documentos de otra empresa, credenciales | **Nunca.** Se excluye en el servidor, no en el prompt |

Regla: el modelo solo recibe lo que el servidor ya autorizó para la identidad autenticada. La minimización se
aplica antes de construir el prompt.

## 4. Arquitectura (C4, nivel de contenedores)

```
Navegador (React)  ──Bearer Supabase──▶  FastAPI (app/services/ai/)
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
          Herramientas de operaciones   Recuperación vectorial     Cliente OpenRouter
          (consultas parametrizadas,     (pgvector, filtrada por   (chat + embeddings,
           RLS, tenant del token)         tenant y RLS)            timeouts, límites)
                    │                        │
                    └──────── PostgreSQL / Supabase (RLS por empresa) ────────
                                             │
                                  Auditoría de consultas (sin secretos)
```

Módulos previstos en `apps/api/app/services/ai/` (responsabilidades separadas):

| Módulo | Responsabilidad | Restricción |
|---|---|---|
| `openrouter_client.py` | Llamadas HTTP a OpenRouter | Clave solo desde `Settings`; nunca en logs ni en errores |
| `orchestrator.py` | Conversación, selección de herramientas, control de bucles | Número máximo de pasos; sin SQL libre |
| `tools_operations.py` | Herramientas de lectura de operaciones | Funciones tipadas y parametrizadas; el tenant viene del contexto autenticado |
| `tools_documents.py` | Búsqueda documental | Solo fragmentos de la empresa autenticada |
| `retrieval.py` | Búsqueda vectorial | Filtro por `tenant_id` además de RLS |
| `permissions.py` | Validación de rol y de empresa | Fuente única: `tenant_memberships` |
| `audit.py` | Registro de uso y costo | Sin prompts completos si contienen datos personales; sin secretos |

**El modelo nunca decide a qué empresa accede.** La empresa la fija el token validado por FastAPI.

## 5. Contratos API (propuesta)

| Método | Ruta | Entrada | Salida | Errores |
|---|---|---|---|---|
| POST | `/api/v1/logix/conversations` | `{ operation_id? }` | `{ id, operation_ref? }` | 401, 403, 404, 503 |
| POST | `/api/v1/logix/conversations/{id}/messages` | `{ body }` (máx. `LOGIX_MAX_INPUT_TOKENS`) | `{ message_id, answer, sources[], status }` | 401, 403, 404, 422, 429, 503 |
| GET | `/api/v1/logix/conversations/{id}/messages` | paginación | mensajes propios de la conversación | 401, 403, 404 |

`status` toma valores explícitos: `answered`, `no_information` (la fuente no tiene el dato), `source_unavailable`
(Logixtic no responde), `limit_reached`. Nunca se inventa una respuesta cuando la fuente no existe.

503 `logix_disabled` mientras `LOGIX_AI_ENABLED` sea `false`. La interfaz muestra ese estado, no una respuesta simulada.

## 6. Variables de entorno

| Variable | Valor por defecto | Quién la usa |
|---|---|---|
| `LOGIX_AI_ENABLED` | `false` | FastAPI |
| `LOGIX_RAG_ENABLED` | `false` (requiere `LOGIX_AI_ENABLED`) | FastAPI |
| `LOGIX_EXTERNAL_PROCESSING_AUTHORIZED` | `false` (D1) | FastAPI |
| `OPENROUTER_API_KEY` | vacía, secreta | FastAPI. **Nunca** en React, Docker build args ni archivos versionados |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | FastAPI (solo https) |
| `OPENROUTER_MODEL` | vacío (D3) | FastAPI |
| `OPENROUTER_EMBEDDING_MODEL` | vacío (D4) | FastAPI |
| `LOGIX_MAX_INPUT_TOKENS` | 4000 | FastAPI |
| `LOGIX_MAX_OUTPUT_TOKENS` | 800 | FastAPI |
| `LOGIX_TIMEOUT_SECONDS` | 20 | FastAPI |
| `LOGIX_MAX_REQUESTS_PER_USER_PER_HOUR` | 30 | FastAPI |
| `LOGIX_DAILY_BUDGET_USD` | 5 (D5) | FastAPI |
| `LOGIX_MAX_RETRIEVED_CHUNKS` | 6 | FastAPI |

El frontend no recibe ninguna variable de Logix. Las credenciales de OpenRouter no pasan por el Dockerfile.

## 7. Seguridad frente a instrucciones maliciosas

- Los documentos y los datos de operación se tratan como **datos**, nunca como instrucciones. Se delimitan en el prompt
  y el sistema lo declara explícitamente.
- Las herramientas tienen permisos fijos: el modelo solo elige entre funciones predefinidas con argumentos validados.
- Ningún resultado de herramienta puede cambiar la empresa, el rol ni la identidad de la consulta.
- Límites: tokens de entrada y salida, pasos por consulta, tiempo por llamada, solicitudes por usuario y presupuesto diario.
- Auditoría: fecha, usuario, empresa, modelo, tokens, coste estimado, herramientas usadas y estado. Sin secretos.
- Pruebas con documentos hostiles y con intentos de acceder a otra empresa (ver criterios).

## 8. Costos

Se registran por consulta: tokens de entrada y salida, modelo, coste estimado y acumulado diario. Cuando el acumulado
alcanza `LOGIX_DAILY_BUDGET_USD`, el servicio responde `limit_reached` hasta el día siguiente. Las cifras de precio
no se fijan aquí: se toman de la documentación vigente del proveedor en el momento de elegir modelo (D3).

## 9. Criterios de aceptación

1. Con `LOGIX_AI_ENABLED=false`, todas las rutas de Logix responden 503 `logix_disabled`.
2. Un usuario de la empresa A nunca recibe fragmentos ni operaciones de la empresa B, con documentos de ambas cargados.
3. Un documento con instrucciones maliciosas no cambia la empresa, el rol ni las herramientas disponibles.
4. Si la fuente de operaciones no responde, la respuesta es `source_unavailable`, sin datos inventados.
5. Si el dato no existe en la fuente, la respuesta es `no_information`.
6. Ningún log, respuesta de error ni payload contiene la clave de OpenRouter.
7. Los límites de tokens, tiempo, solicitudes y presupuesto se prueban con valores pequeños.
8. Ninguna respuesta del asistente se presenta como dato operativo si no proviene de una fuente autorizada.
9. Pruebas E2E con usuarios de dos empresas sintéticas en una base desechable, nunca con datos de clientes.

## 10. Lo que no se hará sin autorización

- Activar consultas reales del agente en staging o producción.
- Enviar datos de clientes a OpenRouter antes de cerrar D1 y D2.
- Aplicar migraciones RAG en un proyecto remoto.
- Insertar documentos ficticios en la base de presentación.
