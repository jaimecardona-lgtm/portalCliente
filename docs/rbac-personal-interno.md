# Personal interno (RBAC): modelo, procedimiento y estado

**Estado:** implementado y probado **en local** (PostgreSQL desechable y almacenamiento simulado). **No aplicado en
Supabase remoto.** La migración `20261112000400_platform_staff` está pendiente, junto con la reconciliación de objetos
ya existentes en remoto (ver `docs/ENTREGA_TECNICA_ENRIQUE.md`, sección 22.6). No hay ningún usuario interno aprovisionado.

## 1. Roles

| Ámbito | Rol | Dónde se guarda | Alcance |
|---|---|---|---|
| Interno | `platform_admin`, `qa`, `developer`, `support` | `platform_staff` | Por asignación explícita de tenants (`staff_tenant_grants`) |
| Cliente | `client_admin`, `client_member`, `client_viewer` | `tenant_memberships` (y `client_memberships`) | Su empresa y su cliente final |

Los dos ámbitos no se mezclan. Un usuario interno **no recibe membresías de tenant ficticias**.

## 2. Matriz de permisos

Tabla `staff_role_permissions` (referencia versionada en la migración):

| Rol | `tenants.read` | `operations.read` | `documents.read` | `tenant_grants.manage` |
|---|---|---|---|---|
| `platform_admin` | Sí | Sí | Sí | Sí |
| `qa` | Sí | Sí | Sí | No |
| `developer` | Sí | Sí | No | No |
| `support` | Sí | Sí | No | No |

En esta fase solo hay endpoints de lectura para `tenants.read` y `operations.read`. `documents.read` está en la matriz
pero **no tiene endpoint de personal**: no se expone ningún documento a personal interno. Las escrituras de QA
(altas, modificaciones y validaciones) requieren permisos y endpoints específicos que aún no existen.

## 3. Reglas de acceso

1. **Identidad:** el usuario se identifica con el JWT verificado por FastAPI. El rol interno se busca en PostgreSQL
   en cada petición (`platform_staff` activo y perfil activo). No se usa `user_metadata` ni el correo.
2. **Tenant verificado:** un tenant solo es visible para personal si tiene `external_tenant_id` y `verified_at`
   (columnas nuevas en `tenants`). Un tenant sin verificar no aparece, aunque esté asignado.
3. **Tenant asignado:** `staff_tenant_grants` debe estar activo. Las asignaciones son explícitas, nunca implícitas.
4. **Contexto transaccional:** para operaciones, FastAPI valida la asignación y fija `app.staff_tenant_id` con
   `set_config` dentro de la transacción. Las políticas RLS exigen ese tenant **y** la asignación. El encabezado
   `X-Tenant-Id` no se usa en rutas de personal: la ruta decide el tenant, y se valida.
5. **Cliente externo:** recibe `403 no_staff_role` en `/api/v1/staff/*`, aunque tenga membresías de cliente.
6. **Revocación:** `active = false` surte efecto en la siguiente petición con el mismo token.
7. **Sin BYPASSRLS:** `portal_app` sigue sin BYPASSRLS. No se crea ningún rol PostgreSQL para QA ni desarrollo.
8. **Auditoría:** cada consulta de tenants, cada selección y cada intento denegado genera una fila en
   `staff_access_audit` (actor, rol, tenant, acción, motivo, resultado y fecha). Sin lectura para el portal.

## 4. Flujo de inicio de sesión

- Tras iniciar sesión, la aplicación consulta `GET /api/v1/staff/me`. Si la persona tiene un rol interno activo, entra
  a `/soporte` sin seleccionar empresa.
- Si no, el flujo de cliente sigue igual: `GET /api/v1/me` con membresía de tenant.
- Una cuenta sin rol interno ni membresía no entra al panel ni a los datos de ninguno de los dos ámbitos.

## 5. Endpoints (`/api/v1/staff`)

| Método | Ruta | Permiso | Efecto |
|---|---|---|---|
| GET | `/me` | Rol interno | Rol y permisos. |
| GET | `/tenants` | `tenants.read` | Tenants asignados y verificados. Audita. |
| POST | `/context` | `tenants.read` | Valida la asignación y fija el contexto. Audita aciertos y denegaciones. |
| POST | `/context/exit` | Rol interno | Audita la salida del contexto. |
| GET | `/tenants/{id}/operations` | `operations.read` | Operaciones del tenant indicado, solo si está asignado y verificado. Audita. |

No existe ningún endpoint que devuelva datos de todos los tenants sin contexto.

## 6. Procedimiento de aprovisionamiento (sin ejecutar)

Script: `apps/api/scripts/provision_staff.py`. Se ejecuta **con la conexión del propietario** (`DATABASE_URL` del
entorno, nunca de `.env`). Se niega a ejecutarse con roles del portal. No imprime correos ni identificadores.

**Requisitos previos (responsable):**

1. Migraciones aplicadas con autorización (ver sección 8).
2. La cuenta existe en Supabase Auth y el responsable tiene su UUID, obtenido del panel. **No se crean cuentas
   desde este procedimiento.**
3. Autorización escrita de la asignación (referencia que se guarda en la base).
4. Verificación oficial de cada empresa que se vaya a asignar: identificador oficial confirmado con la fuente del
   responsable.

**Secuencia (valores entre corchetes los aporta el responsable):**

```powershell
cd apps\api
$env:DATABASE_URL = "<conexión del propietario, no se guarda>"

# 1. Verificar la empresa con su identificador oficial (sin esto, ningún personal la ve).
.\.venv\Scripts\python.exe scripts\provision_staff.py verify-tenant --tenant-slug <slug> --external-id <identificador oficial>

# 2. Conceder el rol interno (requiere autorización escrita).
.\.venv\Scripts\python.exe scripts\provision_staff.py grant-staff --user-id <uuid de Auth> --role qa --authorized-by "<referencia de autorización>" --full-name "<nombre>"

# 3. Asignar la empresa verificada.
.\.venv\Scripts\python.exe scripts\provision_staff.py grant-tenant --user-id <uuid de Auth> --tenant-slug <slug> --authorized-by "<referencia>" --reason "<motivo>"

Remove-Item Env:DATABASE_URL
```

**Revocación inmediata:**

```powershell
.\.venv\Scripts\python.exe scripts\provision_staff.py revoke-staff --user-id <uuid> --reason "<motivo>"
```

Efecto: la siguiente petición de esa persona recibe `403 no_staff_role`.

## 7. Pruebas realizadas (local)

| Suite | Resultado |
|---|---|
| Personal interno: acceso por rol, tenants verificados y asignados, tenant no verificado, cliente externo, sin rol, revocación, auditoría, RLS sin contexto, encabezado falsificado, escrituras denegadas | 12 aprobadas |
| Procedimiento administrativo: validación de autorización, cuentas inexistentes, roles, asignación, revocación, identificadores duplicados | 9 aprobadas |
| API completa con PostgreSQL migrado (8 migraciones) | **205 aprobadas** |
| Web (Vitest), incluido el cliente de personal y las garantías del panel | 236 aprobadas |
| Build de verificación con revisión de bundle | Correcto |

**No probado:** inicio de sesión real de una cuenta interna, Supabase Auth real, RLS con usuarios reales, y las pruebas
de interfaz del panel (solo hay pruebas de cliente HTTP y garantías estáticas).

## 8. Antes de aplicar en remoto

1. Ejecutar `docs/sql/fase-13-estado-remoto-solo-lectura.sql` y reconciliar los objetos ya existentes.
2. Resolver el host del Session Pooler de `DATABASE_URL`.
3. `supabase db push --linked --dry-run`, revisar la lista y pedir autorización explícita antes de cualquier push.

## 9. Pendientes

- Aplicar la migración en remoto (bloqueado por la sección 8).
- Aprovisionar el primer usuario QA: requiere el UUID real y la autorización escrita del responsable.
- Pruebas de interfaz del panel contra Supabase real.
- Escrituras de QA con permisos específicos, motivo y auditoría (no implementadas).
- Documentos para personal interno (`documents.read`): sin endpoint, por diseño en esta fase.
