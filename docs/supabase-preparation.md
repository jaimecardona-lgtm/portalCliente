# Preparación para Supabase (no implementado)

Estado: **solo planificación.** No hay conexión a Supabase, ni migraciones, ni tablas, ni claves en el repositorio. Este documento fija los conceptos para que el frontend y FastAPI se diseñen alrededor de ellos desde ahora.

## Componentes futuros

| Componente | Responsabilidad | Quién lo usa |
|---|---|---|
| **Supabase Auth** | Autenticación por correo y contraseña. Emite tokens (JWT). | Frontend (inicio de sesión y renovación). |
| **Supabase PostgreSQL** | Persistencia de empresas, usuarios, operaciones, eventos, comentarios, documentos, cotizaciones y solicitudes. | FastAPI. |
| **FastAPI** | Valida el token, resuelve la empresa del usuario y aplica permisos en cada endpoint. | Frontend a través de la API. |
| **Supabase Storage** | Adjuntos y documentos. Acceso mediante URLs firmadas de corta duración. | FastAPI genera las URLs. |

## Tablas previstas (no creadas)

- **`profiles`**: datos del usuario (nombre, correo, teléfono). Vinculada a `auth.users` por el mismo identificador.
- **`tenants`**: empresas clientes (razón social, identificación fiscal, país, ciudad, gestor de cuenta).
- **`tenant_memberships`**: relación usuario–empresa con el rol dentro de esa empresa y su estado (activo o desactivado). Es la fuente de verdad para el aislamiento.

Las tablas de dominio (`operations`, `operation_events`, `event_comments`, `documents`, `quotes`, `requests`, `attachments`) llevarán `tenant_id` y se consultarán siempre filtrando por él.

## Flujo previsto de una petición

1. El frontend obtiene un token de Supabase Auth.
2. Envía el token a FastAPI en la cabecera `Authorization`.
3. FastAPI verifica la firma del token con las claves públicas de Supabase.
4. FastAPI busca la membresía activa del usuario (`tenant_memberships`). Sin membresía, responde 403.
5. El `tenant_id` sale de la membresía, **nunca** de un parámetro de la URL o del cuerpo.
6. FastAPI aplica el rol (por ejemplo, `Consulta` no decide cotizaciones) y consulta solo ese tenant.

## Reglas de seguridad que deben cumplirse

- La seguridad real vive en FastAPI y en las políticas de base de datos (Row Level Security) cuando se definan. El filtrado del frontend es solo de presentación.
- Ninguna clave de servicio de Supabase se expone en variables `VITE_*` ni en el bundle.
- Los comentarios con `visibility = internal` no se devuelven a usuarios cliente.
- Las URLs de Storage son firmadas y de vida corta; no se publican buckets.

## Qué ya está preparado en el frontend

- Los tipos de dominio (`src/types/domain.ts`) llevan `tenantId` en todos los modelos relevantes.
- Todas las consultas del repositorio reciben `tenantId`.
- La sesión se guarda como `{ userId, tenantId }`; el identificador de usuario corresponderá a `auth.users` y el de empresa a `tenants`.
- El repositorio local es intercambiable: el remoto deberá implementar `PortalRepository` contra FastAPI.

## Pendiente antes de conectar

1. Crear el proyecto de Supabase y configurar Auth (correo y contraseña, políticas de contraseña, confirmación de correo).
2. Diseñar y revisar las migraciones de `profiles`, `tenants` y `tenant_memberships`, y después el resto del dominio.
3. Definir las políticas RLS junto con las reglas de FastAPI, y probarlas con usuarios de cada tenant.
4. Implementar en FastAPI la verificación de token y la resolución de membresía.
5. Implementar el repositorio remoto y retirar el acceso local de revisión del flujo.

## Migración de perfiles y membresías (fase 05)

Hoy: `apps/web/local/auth/users.json` (cuentas) y `sessions.json` (sesiones por hash). Mañana: `profiles` y `tenant_memberships` en PostgreSQL, con Supabase Auth como proveedor de credenciales.

1. Exportar cuentas sin `passwordHash`: id, nombre, correo normalizado, tenant, rol, estado, fechas y versión de términos aceptada.
2. Crear las cuentas en Supabase Auth con un enlace de invitación o restablecimiento. **No migrar hashes**: cada persona establece su credencial en el sistema definitivo.
3. Insertar `profiles` con el mismo identificador que `auth.users` y una membresía activa por tenant en `tenant_memberships`.
4. Mapear la aceptación de términos a una tabla de consentimientos (o columnas de `profiles`) conservando la versión.
5. Las sesiones locales no se migran: caducan.

Interfaces que deben sustituirse sin reconstruir páginas: `AuthService`, `UserRepository`, `SessionService`, `TenantMembershipRepository` (ver `src/services/auth/contracts.ts`).

## Mapa de identidad, tenant y dominio (contrato previsto)

Este mapa describe el diseño previsto. Ninguna de estas tablas existe todavía.

| Concepto | En Supabase | Clave y regla |
|---|---|---|
| Persona autenticada | `auth.users` (Supabase Auth) | Identificador de la persona. |
| Perfil del portal | `profiles` | Mismo identificador que `auth.users`. Nombre y correo visibles. |
| Empresa cliente | `tenants` | `tenant_id` único. Razón social, NIT, país, gestor de cuenta. |
| Acceso a una empresa | `tenant_memberships` | `(user_id, tenant_id)`, rol y estado. **Fuente de verdad** del aislamiento. |
| Operación (DO) | `operations` | `tenant_id` obligatorio. Datos sincronizados desde Logixtic (a definir). |
| Evento de seguimiento | `operation_events` | `tenant_id`, `operation_id`. Un cambio de estado crea un evento nuevo. |
| Comentario y respuesta | `event_comments` | `tenant_id`, `operation_id`, `event_id`, `parent_comment_id`, `visibility`. |
| Documento y versión | `documents`, `document_versions` | `tenant_id`. Archivo en Storage con URL firmada. |
| Cotización y decisión | `quotes`, `quote_decisions` | `tenant_id`. Decisión validada por vigencia y estado en el servidor. |
| Solicitud y adjuntos | `requests`, `attachments` | `tenant_id`. Adjuntos validados antes de almacenarse. |

**Datos que se consultan desde Logixtic**: operaciones, eventos de seguimiento, documentos oficiales y cotizaciones emitidas (fuente de verdad: Logixtic).

**Datos propios del portal**: perfiles, empresas y membresías del portal, comentarios de clientes, solicitudes, decisiones de cliente, aceptación de términos y preferencias.

**Pendiente de definir con Logixtic**: forma de sincronización (consulta o replicación), fuente de verdad de cada estado y tratamiento de cambios simultáneos.
