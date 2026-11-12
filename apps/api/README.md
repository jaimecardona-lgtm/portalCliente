# API del portal de clientes (FastAPI)

Backend del Portal de Clientes Logixtic. Sirve datos a usuarios de empresas cliente autenticados con
Supabase Auth, aplicando aislamiento por empresa en la aplicación **y** en PostgreSQL (Row Level Security).

> **Estado:** fase 07. Probado contra PostgreSQL local. **No está conectado a ningún proyecto Supabase
> ni al sistema Logixtic.** Ver "Pendientes" más abajo.

## Qué incluye

- Migración `0001_foundation` (Alembic): tenants, perfiles, membresías, referencias de operación,
  eventos, comentarios por evento, solicitudes y adjuntos; claves compuestas que impiden referencias
  cruzadas entre empresas; RLS en ocho tablas; rol `portal_app` sin `BYPASSRLS`.
- Verificación de JWT de Supabase (HS256 con secreto, o RS256/ES256 con JWKS).
- Endpoints v1 de solo lectura más creación de comentarios. Ver la lista abajo.
- Pruebas unitarias y de integración (incluidas las referencias cruzadas entre empresas).

## Requisitos

- Python 3.12
- PostgreSQL 15 o superior para pruebas (probado con 18)

## Instalación

Desde `apps/api`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

## Base de datos local de pruebas

> **Aviso (fase 08C):** la fuente canónica del esquema es `supabase/migrations/` (Supabase CLI). Las migraciones
> de `migrations/` son la referencia histórica de Alembic. No ejecutar `alembic upgrade` sobre un esquema gestionado
> por Supabase CLI. Ver `docs/database-migration-strategy.md`. Los comandos de abajo sirven para la copia de
> referencia en una base desechable.

Cree una base vacía en un PostgreSQL local (nunca en un proyecto remoto para pruebas):

```sql
CREATE DATABASE portal_test;
```

Aplique la migración:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal_test"
.\.venv\Scripts\alembic.exe upgrade head
```

La migración crea el rol `portal_app`. El usuario de conexión debe poder hacer `SET ROLE portal_app`
(en local, el superusuario lo permite).

## Ejecución

```powershell
$env:DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal_test"
.\.venv\Scripts\uvicorn.exe app.main:create_app --factory --reload --port 8000
```

Sin `SUPABASE_URL` y `SUPABASE_JWT_SECRET` (o `SUPABASE_JWKS_URL`), la API arranca pero responde **503**
en las rutas protegidas. Nunca se simula un inicio de sesión.

## Pruebas

```powershell
$env:PORTAL_TEST_DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal_test"
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app tests migrations
.\.venv\Scripts\python.exe -m ruff format --check app tests migrations
```

Sin `PORTAL_TEST_DATABASE_URL` se omiten las pruebas de integración (marcador `integration`).
Las pruebas usan solo datos sintéticos (`.test`, nombres ficticios) y un secreto de firma de prueba.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado y versión. Pública. |
| GET | `/api/v1/me` | Persona, empresa activa, rol y empresas disponibles. |
| GET | `/api/v1/tenants/current` | Datos básicos de la empresa activa. |
| GET | `/api/v1/operations` | Operaciones de la empresa (`limit`, `offset`). |
| GET | `/api/v1/operations/{id}` | Detalle de una operación. |
| GET | `/api/v1/operations/{id}/events` | Eventos visibles para el cliente. |
| GET | `/api/v1/operations/{id}/events/{event_id}/comments` | Hilo de comentarios visibles. |
| POST | `/api/v1/operations/{id}/events/{event_id}/comments` | Crea comentario o respuesta. Requiere rol `client_admin` o `client_member`. |

Cabeceras:

- `Authorization: Bearer <token de Supabase>` en todas las rutas salvo `/health`.
- `X-Tenant-Id: <uuid>` solo si la persona pertenece a varias empresas. Solo puede elegir entre
  membresías existentes; nunca crea una.

Errores, siempre con este formato:

```json
{"error": {"code": "operation_not_found", "message": "La operación no existe.", "request_id": "..."}}
```

## Reglas de autorización

1. El tenant y el rol salen de `tenant_memberships`. El cliente no los envía ni los fija.
2. Una operación, evento o comentario de otra empresa responde **404**, igual que uno inexistente.
3. Los comentarios cuelgan de un evento. Una respuesta debe apuntar a un comentario del mismo evento
   y visible para el cliente.
4. Un comentario **no cambia el estado** de la operación.
5. El autor, su nombre (copiado de su perfil) y el lado (`client`) los fija el servidor.
6. Los eventos y comentarios internos nunca se devuelven en la API v1.
7. Empresa suspendida o perfil deshabilitado: 403.

## Arquitectura

```
app/
  main.py              fábrica create_app (CORS, errores, rutas)
  api/deps.py          token -> sesión con RLS -> contexto de empresa
  api/v1.py            rutas
  core/                configuración, errores, JWT, logging, request id
  db/                  motor, activación de RLS por petición, modelos ORM
  repositories/        consultas; todas filtran por tenant_id
  services/            contexto de petición y reglas de comentarios
  schemas/             contratos JSON de entrada y salida
migrations/            Alembic; 0001_foundation con SQL explícito
tests/                 unit/ (sin base de datos) e integration/ (PostgreSQL)
```

Por petición, la sesión ejecuta `SET LOCAL ROLE portal_app` y `set_config('app.current_user_id', ...)`.
Así las políticas de RLS se aplican aunque la conexión tenga más privilegios.

## Variables de entorno

Ver [`.env.example`](.env.example). Ningún secreto tiene valor por defecto. No versione `.env`.

## Pendientes (no hechos en esta fase)

- **Proyecto Supabase real**: sin credenciales. Hay que definir `SUPABASE_URL`, `SUPABASE_JWT_SECRET` o
  `SUPABASE_JWKS_URL`, y aplicar la migración allí **solo con autorización**.
- **Aprovisionamiento de usuarios y empresas**: no existe API; se hará con un proceso controlado.
- **Adjuntos y solicitudes**: el esquema existe, pero no hay endpoints de subida ni de descarga.
- **Sistema Logixtic**: no hay integración. Las operaciones y eventos son referencias sincronizadas
  que aún no tienen proceso de sincronización.
- **Frontend**: `apps/web` sigue usando el repositorio mock y el sistema JSON local. El adaptador
  `apps/web/src/services/api/` está preparado y probado, pero no está conectado a las pantallas.
- **Brechas de contrato**: el modelo `Operation` del frontend exige campos que esta API no expone.
  Ver `docs/fastapi-integration.md`, sección 6.
- Documentación de integración: `docs/fastapi-integration.md` y `docs/supabase-preparation.md`.
