# Documentos de operación en Supabase Storage (sprint MVP)

**Estado:** backend implementado y probado localmente contra PostgreSQL desechable con almacenamiento simulado.
**No probado con Supabase Storage real.** No hay cuenta empresarial autorizada ni clave privilegiada en el entorno
local. El flujo E2E real queda pendiente (sección 6).

## 1. Modelo

| Elemento | Dónde | Notas |
|---|---|---|
| Documento vigente | `client_documents` | Una fila por documento lógico. Guarda la referencia vigente (`storage_path`), tamaño, SHA-256, versión y estado. |
| Auditoría mínima | `client_document_events` | Acciones `uploaded`, `replaced`, `removed`, con actor, versión y hash. Sin lectura para el portal. |
| Cola de limpieza | `storage_cleanup_jobs` | Objetos pendientes de borrar: motivo, intentos y error sanitizado. Solo inserción desde el portal. |
| Bucket | `logixtic-client-documents` | Privado. Límite 5 MB. Tipos: PDF, PNG, JPEG y XLSX. Creado con la API de Storage. |
| `attachments` | Sin cambios | Sigue ligado a solicitudes. Los documentos de operación tienen su propio modelo. |

Migración nueva: `supabase/migrations/20261112000200_client_documents.sql`. Reversión:
`supabase/rollback/20261112000200_client_documents.down.sql`. No modifica migraciones aplicadas.

## 2. Ruta interna

```
tenants/{tenant_id}/clients/{client_account_id}/operations/{operation_id}/documents/{document_id}/{file_uuid}.{ext}
```

Solo UUID generados por la aplicación. El nombre de archivo, el de la empresa y el de la persona **nunca** forman
parte de la ruta. El navegador no elige bucket ni ruta.

## 3. Permisos

Todas las decisiones usan el mismo contexto autenticado:

1. Token de Supabase verificado y empresa activa (cabecera `X-Tenant-Id` si hay varias).
2. Operación o documento visible: membresía **de cliente final** activa **y** membresía de tenant activa (RLS).
3. Subir, reemplazar y retirar: rol `client_admin` del cliente final de ese documento.
4. Ver y pedir enlace: cualquier miembro del cliente final asignado.
5. El prefijo de Storage no concede acceso.

Una membresía de tenant no basta. Dora, que pertenece a dos empresas, no ve documentos de sus clientes sin
membresía de cliente final. Un código o nombre de empresa no concede acceso.

## 4. Endpoints

| Método | Ruta | Acceso | Notas |
|---|---|---|---|
| GET | `/api/v1/operations/{id}/documents` | Cliente asignado | Solo documentos disponibles. |
| POST | `/api/v1/operations/{id}/documents` | `client_admin` | Cuerpo binario, `Content-Type` y cabecera `X-File-Name`. |
| GET | `/api/v1/documents/{id}/link` | Cliente asignado | URL firmada temporal (300 s por defecto). No se guarda. |
| PUT | `/api/v1/documents/{id}/file` | `client_admin` | Reemplazo: nueva versión, referencia actualizada, anterior a la cola. |
| DELETE | `/api/v1/documents/{id}` | `client_admin` | Retirada: estado `removed`, sin ruta, objeto a la cola y borrado. |

Errores: 401 sin sesión, 403 sin rol, 404 si la operación o el documento no son visibles (misma respuesta que
inexistente), 413 tamaño, 415 tipo o contenido, 422 archivo vacío o nombre, 502 Storage no disponible, 503 Storage
no configurado o fallo de persistencia.

Validación del archivo: tamaño, tipo declarado en lista blanca, extensión coherente, firma binaria del contenido
(`%PDF-`, PNG, JPEG, ZIP con `[Content_Types].xml` para XLSX), nombre sin rutas ni caracteres de control. El SHA-256
se calcula sobre el contenido recibido.

## 5. Compensaciones

| Caso | Tratamiento |
|---|---|
| Subida correcta, INSERT fallido | Se borra el objeto. Si el borrado falla, se encola `insert_failed`. |
| Subida incompleta o con error | Se intenta borrar. Si falla, se encola `upload_incomplete`. |
| Reemplazo: nueva versión OK | La referencia cambia y el objeto anterior se encola **en la misma transacción**. Después se intenta borrar. |
| Reemplazo: borrado anterior fallido | El trabajo queda `pending` y se reintenta con el procedimiento administrativo. |
| Retirada interrumpida | El trabajo se registra en la misma transacción que la retirada. Nunca se pierde. |
| Objeto que volvió a ser referencia válida | El procedimiento administrativo **no lo borra**. Lo marca como resuelto. |

Procedimiento administrativo reintentable: `apps/api/scripts/reconcile_storage_cleanup.py`. Usa la conexión del
**propietario** (la cola no es legible por el portal). Por defecto simula; `--apply` borra. Tras 5 intentos fallidos
el trabajo pasa a `failed` para revisión manual. No depende de BackgroundTasks, porque Render Free puede suspender el
servicio.

**Límite conocido:** el borrado síncrono exitoso no marca el trabajo como `done` (el portal no tiene `UPDATE` sobre la
cola). El procedimiento administrativo lo marca después. Borrar dos veces un objeto inexistente es inocuo.

## 6. Configuración

| Variable | Dónde | Notas |
|---|---|---|
| `SUPABASE_URL` | API | Ya existente. |
| `SUPABASE_SECRET_KEY` | **Solo API** | Clave privilegiada de Storage. Nunca en React, en build args de Docker ni en el repositorio. Sin ella, las rutas responden 503. |
| `STORAGE_SIGNED_URL_SECONDS` | API | 60 a 600. Por defecto 300. |

Aprovisionamiento del bucket: `apps/api/scripts/provision_storage_bucket.py`. Por defecto solo verifica. Con `--apply`
crea el bucket si no existe. Si existe con otra configuración, no lo modifica.

## 7. Pruebas realizadas

| Suite | Resultado |
|---|---|
| Reglas de validación y rutas (unitarias) | Aprobadas |
| Aprovisionamiento del bucket con transporte simulado | Aprobadas (7) |
| Documentos: autorización, validación, enlaces, reemplazo, retirada y compensaciones (integración, RLS) | Aprobadas (19) |
| Reconciliación de la cola (integración) | Aprobadas |
| Suite completa de la API con base migrada | **176 aprobadas**, 0 fallidas |
| Suite sin base de datos | 78 aprobadas |
| Ruff (lint y formato) | Correcto |

Errores corregidos durante las pruebas (documentados porque afectan a la seguridad):

- La política de lectura de documentos bloqueaba la retirada (PostgreSQL aplica la política de lectura a la fila nueva
  de un `UPDATE`). Ahora los administradores del cliente pueden leer documentos retirados; los demás no.
- `INSERT ... ON CONFLICT` en la cola exigía lectura de la tabla, que el portal no tiene. Se eliminó: las rutas son
  UUID nuevos y no hay colisiones.
- La comparación de tipos MIME del bucket tenía una precedencia incorrecta (corregida antes de cualquier commit).

## 8. Pendientes

1. **Flujo E2E real** (bloque 9): requiere una cuenta empresarial autorizada, un documento real autorizado,
   `portal_api` creado y el Session Pooler verificado. Hoy el host de `DATABASE_URL` no resuelve y no hay clave de
   Storage en el entorno.
2. **Bucket real:** ejecutar `provision_storage_bucket.py --apply` con autorización.
3. **Frontend operativo** (bloque 7): listado, subida, descarga, reemplazo y eliminación en la interfaz. No está
   implementado en esta fase.
4. **Adjuntos de solicitudes** (bloque 4, parte final): no implementados.
5. **Reconciliación de objetos huérfanos** por listado del bucket: solo se procesa la cola, no se listan objetos sin
   referencia.
6. **Logix sobre documentos:** fuera del camino crítico y sin activar.
