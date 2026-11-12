# Primer acceso real con Supabase Auth (fase 11B)

**Alcance de este documento:** lo que el responsable del proyecto debe configurar a mano en el panel de Supabase,
cómo crear el rol de conexión de la API sin BYPASSRLS, y los pasos para el primer inicio de sesión real.

**Qué no hace este documento:** no crea usuarios, empresas, perfiles ni cotizaciones. No ejecuta `seed.sql`.
No despliega en Render. Todo lo que aquí figura como "dato real" debe proporcionarlo el responsable con autorización.

> Las acciones marcadas **[Manual]** las ejecuta una persona con acceso al proyecto de Supabase. Ninguna contraseña,
> clave secreta ni token debe pegarse en el repositorio, en un chat, en un ticket o en un registro.

---

## 1. Estado técnico antes del primer acceso

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Esquema, RLS y privilegios (`supabase/migrations/`) | Aplicado en el proyecto real (según el responsable). | Auditoría estructural del responsable. |
| Frontend: login, cierre de sesión, recuperación y guarda de rutas con Supabase | Implementado. Se activa con `VITE_AUTH_PROVIDER=supabase`. | Pruebas unitarias y build de verificación. **No probado contra un proyecto real.** |
| Frontend: identidad desde `GET /api/v1/me` | Implementado. Sin membresía, suspensión o sesión caducada se muestra un estado neutro. | Pruebas unitarias (`account-issues.test.ts`). |
| Frontend: pantallas de datos (operaciones, documentos, cotizaciones) | **No disponibles**: la API v1 no cubre esos modelos. Muestran "información no disponible". | `docs/fastapi-integration.md`, sección 6. |
| API: verificación de JWT de Supabase | Implementado. | Pruebas de integración contra PostgreSQL desechable. |
| API: preflight del rol de conexión (`apps/api/scripts/check_db_role.py`) | Implementado. Solo lectura. | Pruebas unitarias e integración; ensayo local con un rol `portal_api` desechable. |

**Límites conocidos de esta fase**

- Si una cuenta pertenece a **varias empresas**, la interfaz muestra que la selección no está disponible y no entra.
  La cabecera `X-Tenant-Id` existe en la API, pero no hay pantalla para elegir empresa.
- Las pantallas de datos no tienen fuente real hasta que la API exponga operaciones completas (ver la sección 6 de
  `docs/fastapi-integration.md`). Es lo esperado: no se rellenan con ejemplos.

---

## 2. Ajustes del proyecto en el panel de Supabase [Manual]

Revise cada punto en **Authentication** y **Project Settings** del proyecto **de desarrollo o de prueba** primero.
Repita en el de producción cuando exista. Las recomendaciones son el punto de partida; la decisión es del responsable.

| # | Ajuste (ubicación aproximada) | Valor recomendado | Motivo |
|---|---|---|---|
| 1 | Authentication → Sign In / Providers → **Email** | Activado, con **contraseña** (no magic link como único método) | La aplicación inicia sesión con correo y contraseña. |
| 2 | Authentication → Sign In / Providers → Email → **Confirm email** | **Activado** | Un correo no verificado no debe recibir acceso. |
| 3 | Authentication → Sign In / Providers → **Allow new users to sign up** (registro público) | **Desactivado** | Las cuentas se crean por invitación de Logixtic. El formulario `/registro` ya no crea cuentas en modo Supabase. |
| 4 | Authentication → Users → **Invite user** | Uso habitual para dar de alta a una persona autorizada | Funciona aunque el registro público esté desactivado. |
| 5 | Authentication → URL Configuration → **Site URL** | URL pública final de la aplicación, `https://…` | Base de los enlaces de los correos. |
| 6 | Authentication → URL Configuration → **Redirect URLs** | Solo `https://<dominio>/restablecer-contrasena`. En desarrollo, `http://127.0.0.1:5173/restablecer-contrasena`. **Sin comodines** | La recuperación vuelve a esa ruta. Cualquier otra redirección es un riesgo. |
| 7 | Authentication → Email Templates (**Invite user**, **Reset password**) | Texto neutro en español, sin prometer plazos ni mencionar datos de la empresa | La plantilla por defecto puede dar información innecesaria. |
| 8 | Authentication → SMTP settings | Proveedor SMTP propio para producción | El remitente por defecto tiene límites de envío y no es para uso productivo. |
| 9 | Authentication → Password policy | Longitud mínima **12** o más y comprobación de contraseñas filtradas si está disponible | La aplicación exige 8 en el formulario y recomienda 12. Confirme ambos valores. |
| 10 | Authentication → Sessions / JWT expiry | Caducidad del token de acceso de 3600 s (por defecto) y **rotación del token de renovación** activada | Limita el uso de un token robado. |
| 11 | Authentication → Attack protection / Rate limits | Activado; CAPTCHA si el plan lo incluye | Protege el inicio de sesión y la recuperación. |
| 12 | Project Settings → **JWT Keys** (o JWT Secret) | Anote **qué tipo de firma usa el proyecto**: asimétrica (JWKS) o secreto heredado (HS256) | Determina qué variable configurar en la API (ver la sección 3). |
| 13 | Project Settings → **Data API** (exposed schemas) | Si la aplicación no usa PostgREST directamente, quitar `public` de los esquemas expuestos | La API FastAPI es la única vía. Las migraciones ya retiran privilegios a `anon` y `authenticated`. |
| 14 | Project Settings → API Keys | Usar **solo** la clave publicable en el frontend. La clave `service_role` / secreta **no** sale del proyecto | Esas claves saltan la RLS. |
| 15 | Database → Connection string | Para la API, la cadena del **pooler** en modo transacción (puerto 6543). La conexión directa queda para migraciones | Coincide con la recomendación de `docs/supabase-preparation.md`. |
| 16 | Project Settings → General / Backups | Región confirmada, copias de seguridad y retención según el plan | Requisito antes de datos reales. |

**Variables que este paso produce (solo se guardan en el panel de Render, nunca en el repositorio):**

| Servicio | Variable | Valor |
|---|---|---|
| API (Render) | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| API (Render) | `SUPABASE_JWKS_URL` **o** `SUPABASE_JWT_SECRET` | Según el punto 12. JWKS: `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| API (Render) | `DATABASE_URL` | Cadena del rol `portal_api` (sección 4). **Nunca** `postgres`. |
| API (Render) | `DATABASE_APP_ROLE` | `portal_app` |
| API (Render) | `APP_ENV` | `production` |
| Frontend (build de Render) | `VITE_AUTH_PROVIDER` | `supabase` |
| Frontend (build de Render) | `VITE_API_BASE_URL` | `/api/v1` (mismo origen) |
| Frontend (build de Render) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Públicas por diseño. Solo la clave publicable. |

---

## 3. Verificación de la firma del token (decisión del punto 12)

- **Si el proyecto usa claves asimétricas (JWKS):** configure `SUPABASE_JWKS_URL` y deje vacío `SUPABASE_JWT_SECRET`.
- **Si usa el secreto heredado (HS256):** configure `SUPABASE_JWT_SECRET` (en el panel de Render, marcado como secreto) y
  deje vacío `SUPABASE_JWKS_URL`.

La API no acepta un token sin verificar la firma. Si falta la configuración, responde `503 auth_not_configured`.

---

## 4. Rol de conexión `portal_api` (sin BYPASSRLS) [Manual]

**Por qué:** la API debe conectarse con un rol propio que no tenga `BYPASSRLS`, y pasar a `portal_app` en cada
petición (`SET LOCAL ROLE`). Si se conectara como `postgres`, la RLS no se aplicaría.

**Requisitos**

- Autorización explícita del responsable para crear el rol en ese proyecto.
- Las migraciones de `supabase/migrations/` ya aplicadas (crean `portal_app`).
- Una contraseña generada **fuera del repositorio** (gestor de contraseñas). No se escribe en ningún archivo.

**Procedimiento** (SQL Editor del proyecto, con el rol `postgres` del propio panel, una sola vez):

```sql
-- 1) Comprobar que el rol de la aplicación existe y no tiene BYPASSRLS ni LOGIN.
SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'portal_app';
-- Esperado: rolcanlogin = false, rolbypassrls = false.

-- 2) Crear el rol de conexión sin contraseña en el SQL (así no queda en el historial del editor).
CREATE ROLE portal_api LOGIN NOBYPASSRLS NOCREATEROLE NOCREATEDB NOSUPERUSER;

-- 3) Asignar la contraseña con psql, desde un terminal con acceso a la base, sin escribirla en el SQL:
--    \password portal_api
--    (psql pide la contraseña dos veces y no la muestra)

-- 4) Hacer miembro a portal_api del rol de la aplicación.
GRANT portal_app TO portal_api;

-- 5) Comprobar atributos y membresía.
SELECT rolname, rolcanlogin, rolbypassrls, rolcreaterole, rolsuper
FROM pg_roles WHERE rolname IN ('portal_api', 'portal_app');
SELECT pg_has_role('portal_api', 'portal_app', 'MEMBER');  -- esperado: true
```

**Cadena de conexión de la API** (pooler de Supabase, modo transacción). El nombre de usuario del pooler incluye la
referencia del proyecto:

```
postgresql+psycopg://portal_api.<ref-del-proyecto>:<contraseña-generada>@<host-del-pooler>:6543/postgres
```

El host del pooler figura en el panel del proyecto (Connect). Guárdela solo en Render como secreto.

**Verificación con el script de solo lectura** (desde `apps/api`, con la cadena en el entorno, sin escribirla en argumentos):

```powershell
$env:DATABASE_URL = "<cadena del rol portal_api>"
.\.venv\Scripts\python.exe scripts\check_db_role.py
Remove-Item Env:DATABASE_URL
```

Resultado esperado: todas las líneas `[OK]` y `Resultado: el rol cumple los requisitos de la API.` Si aparece algún
`[PROBLEMA]`, no arranque la API ni aplique migraciones. El script no imprime la cadena ni contraseñas.

**Reversión** (solo con la API parada y autorización):

```sql
REVOKE portal_app FROM portal_api;
DROP ROLE portal_api;
```

**No hacer**

- No añadir la creación del rol a `supabase/migrations/`: depende del proyecto y de la contraseña.
- No usar `postgres`, `service_role` ni un rol con `BYPASSRLS` en la API.
- No aprovisionar datos con `portal_api`: el aprovisionamiento usa la conexión del propietario (sección 5).

---

## 5. Primer inicio de sesión real [Manual]

Esta secuencia no se ejecutó en esta fase: requiere datos reales y autorización. **No invente datos**: el responsable
debe facilitar por escrito el correo de la persona, su nombre, la razón social y el NIT de la empresa cliente, el
identificador de la empresa (slug) y el rol.

1. **Ajustes del panel** completados (sección 2), con el registro público desactivado.
2. **Invitar a la persona** en Authentication → Users → *Invite user*, con su correo real. Anote el **UUID** del
   usuario que aparece en el panel. La persona fija su contraseña desde el enlace de invitación.
3. **Crear empresa, perfil y membresía** con el proceso controlado. Conexión: la del **propietario** del esquema
   (no `portal_api`), y **sin** la opción sintética:

   ```powershell
   cd apps\api
   $env:DATABASE_URL = "<conexión del propietario, no se guarda>"
   .\.venv\Scripts\python.exe scripts\provision_dev.py `
     --user-id <uuid del usuario> `
     --email <correo real autorizado> --full-name "<nombre real>" `
     --tenant-slug <slug> --tenant-legal-name "<razón social real>" `
     --tenant-tax-id <NIT real> --role client_admin
   Remove-Item Env:DATABASE_URL
   ```

   - No use `--synthetic-operation`: en datos reales la política del proyecto lo prohíbe.
   - El nombre del script dice "dev", pero el aprovisionamiento es idempotente y es el único camino de alta. Requiere
     la autorización del responsable para ejecutarlo contra el proyecto real.
4. **Ejecutar el preflight** con la cadena de `portal_api` (sección 4). Debe quedar todo en `[OK]`.
5. **Configurar Render** con las variables de la sección 2 y desplegar **solo cuando el responsable lo autorice**.
6. **Probar en el navegador** (ventana privada):
   - `/operaciones` sin sesión → redirige a `/login`.
   - Inicio de sesión con la cuenta invitada → la cabecera muestra la razón social y el nombre de la persona.
   - Las pantallas de operaciones, documentos y cotizaciones muestran "información no disponible". Es lo esperado.
   - Contraseña incorrecta → mensaje genérico, sin revelar si el correo existe.
   - Una cuenta sin empresa asignada → "todavía no tiene una empresa asignada".
   - Cerrar sesión → vuelve a `/login` y `/operaciones` vuelve a redirigir.
7. **Comprobar la API** con la sesión real, sin copiar el token en ningún sitio: `GET /api/v1/me` debe responder 200
   con la empresa correcta, y `GET /api/v1/me` sin token debe responder 401.
8. **Registrar la evidencia** (fecha, quién lo hizo, resultado) en el registro del proyecto, sin capturas que muestren
   datos personales de clientes.

---

## 6. Qué no está verificado en el repositorio

- Ningún paso contra un proyecto real de Supabase. Las pruebas usan un cliente sintético y PostgreSQL local.
- El envío de correos de invitación y de recuperación depende del SMTP configurado en el panel.
- La compatibilidad del pooler de Supabase con `SET LOCAL ROLE` debe confirmarse con el preflight en el proyecto real.
- El despliegue en Render no se ha ejecutado.
