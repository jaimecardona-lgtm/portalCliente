# Primera prueba E2E contra Supabase real: documentos de cliente final

**Estado:** preparada. **No ejecutada.** Requiere una cuenta y archivos autorizados del responsable, y las
migraciones aplicadas en el proyecto. Este documento no contiene credenciales ni valores privados.

## 1. Qué demuestra

Con una cuenta real invitada por el responsable:

1. Inicio de sesión con Supabase Auth desde la interfaz.
2. Consulta de los clientes finales de la cuenta (`/api/v1/client-access`).
3. Subida de un PDF real: el archivo queda en el bucket privado y la referencia en PostgreSQL.
4. Apertura mediante enlace firmado temporal (la URL contiene `token=`).
5. Reemplazo: nueva versión y retirada del objeto anterior.
6. Retirada con confirmación: el documento deja de aparecer.

**No demuestra** el acceso denegado desde otros tenants ni otros clientes. Esas pruebas usan datos sintéticos aislados
en la base de pruebas (`apps/api/tests/integration`). Para cubrirlas con datos reales, el responsable debe invitar una
segunda cuenta de otra empresa y ejecutar el mismo flujo con ella.

## 2. Requisitos previos (responsable)

| Requisito | Dónde | Estado al cierre de esta fase |
|---|---|---|
| Migraciones `20261112000000`, `…100`, `…200`, `…300` aplicadas con `supabase db push --linked` | Proyecto remoto | **Pendiente de autorización** |
| Cuenta administradora de un cliente final, invitada (no creada por la aplicación) | Auth del proyecto | **Pendiente** |
| Cliente final asignado a esa cuenta (`client_memberships`) | Aprovisionamiento con datos reales | **Pendiente** |
| Bucket `logixtic-client-documents` privado | `provision_storage_bucket.py --apply` | **Pendiente de autorización** |
| `portal_api` creado y verificado, Session Pooler real | Panel y `check_db_role.py` | **Pendiente** (la URL actual no resuelve) |
| Registro público desactivado | Panel de Auth | **Pendiente** (estaba activo) |
| Dos archivos PDF autorizados (original y reemplazo) | Equipo del responsable | **Pendiente** |

## 3. Configuración local (solo en el equipo del responsable)

Variables por nombre. Los valores van en `apps/api/.env` (API), `apps/web/.env.local` (frontend) o en el entorno del
terminal. Nunca en el repositorio ni en el historial del terminal compartido.

**API (FastAPI):** `DATABASE_URL` (rol `portal_api`), `DATABASE_APP_ROLE=portal_app`, `SUPABASE_URL`,
`SUPABASE_JWKS_URL` o `SUPABASE_JWT_SECRET`, `SUPABASE_SECRET_KEY` (solo la API), `APP_ENV=development`.

**Frontend:** `VITE_AUTH_PROVIDER=supabase`, `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Ninguna clave privilegiada.

**Prueba E2E:** `E2E_SUPABASE=1`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_PDF_PATH`, `E2E_PDF_REPLACEMENT_PATH`.

## 4. Procedimiento

```powershell
# 1. Verificar el rol de conexión (solo lectura). Debe salir todo en [OK].
cd apps\api
.\.venv\Scripts\python.exe scripts\check_db_role.py

# 2. Verificar (sin crear) el bucket privado.
.\.venv\Scripts\python.exe scripts\provision_storage_bucket.py

# 3. API en una terminal.
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --port 8000

# 4. Frontend en otra terminal (modo Supabase).
cd ..\web
npm run dev -- --host 127.0.0.1 --port 5173

# 5. E2E en una tercera terminal.
$env:E2E_SUPABASE = "1"
$env:E2E_EMAIL = "<cuenta autorizada>"
$env:E2E_PASSWORD = "<contraseña, solo en este terminal>"
$env:E2E_PDF_PATH = "<ruta a PDF autorizado>"
$env:E2E_PDF_REPLACEMENT_PATH = "<ruta a otro PDF autorizado>"
npx playwright test -c playwright.supabase.config.ts
```

Sin `E2E_SUPABASE=1` y sin las variables, la prueba **se omite** y no toca la red. Así se comprobó en esta fase.

Tras la prueba, borre las variables del terminal (`Remove-Item Env:E2E_PASSWORD`) y revise que el bucket no conserve
objetos de prueba que no deban quedar (las retiradas borran el objeto; los reemplazos también).

## 5. Qué se considera aprobado

La prueba pasa solo si se cumplen los seis pasos de la sección 1 en la misma ejecución. Un paso omitido o un
mensaje de error no cuentan como aprobado. Si falla, el informe de Playwright y la traza quedan en `test-results/`
(carpeta ignorada por Git).

## 6. Límites conocidos

- La prueba solo usa **un** cliente final de la cuenta. Con varios clientes, el selector aparece pero no se recorre.
- No hay prueba de carga ni de límites de tamaño contra Storage real (los límites están probados con el almacenamiento simulado).
- Los documentos ligados a operaciones no se prueban: dependen de la integración con DO, que no existe todavía.
