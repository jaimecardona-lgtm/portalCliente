# Despliegue en Render (un solo servicio Docker)

**Estado: preparado, no desplegado.** Este documento describe la arquitectura, la configuración y los límites
del plan gratuito. No hay ningún servicio creado en Render ni ninguna base de datos remota conectada.

## 1. Arquitectura

```
Navegador ──HTTPS──► Render Web Service (Docker, plan Free)
                      ├── /              index.html y assets de React (dist/ compilado en el build)
                      ├── /login, /operaciones/... fallback SPA hacia index.html
                      ├── /api/v1/*      API FastAPI (mismo origen)
                      └── /health        healthcheck
                            │
                            ├──► Supabase Auth      (verificación de JWT; el frontend obtiene el token)
                            └──► Supabase PostgreSQL (conexión de la API con rol propio, sin BYPASSRLS)
```

- **Un monorepo, una imagen, un proceso.** Dockerfile en la raíz; contexto de build en la raíz.
- **Frontend y API en el mismo origen:** el frontend usa `VITE_API_BASE_URL=/api/v1`. No hay CORS.
- **Sin base de datos ni Redis en Render.** La base vive en Supabase.
- **Sin migraciones al arrancar.** Ver `database-migration-strategy.md`.

## 2. Archivos

| Archivo | Función |
|---|---|
| `Dockerfile` | Etapa Node (compila React con `npm ci`) y etapa Python slim (API + `dist/`). Usuario no root. |
| `.dockerignore` | Excluye `.env`, JSON locales de autenticación, `node_modules`, `.venv`, documentación y el PDF de marca. |
| `render.yaml` | Blueprint de un único servicio Docker en plan Free, healthcheck `/health`. |
| `apps/api/app/web/spa.py` | Sirve `dist/` y el fallback SPA. Nunca responde HTML a rutas `/api/...`. |

## 3. Construcción y prueba local (cuando haya memoria y Docker)

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="https://<ref>.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<clave publicable>" \
  -t logixtic-client-portal .

docker run --rm -p 8000:8000 \
  -e APP_ENV=production \
  -e SUPABASE_URL="https://<ref>.supabase.co" \
  -e SUPABASE_JWKS_URL="https://<ref>.supabase.co/auth/v1/.well-known/jwks.json" \
  -e DATABASE_URL="postgresql+psycopg://<rol>:<clave>@<host>:<puerto>/postgres" \
  logixtic-client-portal
```

Comprobaciones esperadas:

- `GET /health` responde JSON `{"status":"ok"}`.
- `GET /login` y `GET /operaciones/<id>` responden `index.html` (navegación SPA).
- `GET /api/v1/inexistente` responde 404 JSON, nunca HTML.

Estas comprobaciones **no se han ejecutado** en esta fase (falta memoria para Docker).

## 4. Variables de entorno

### En tiempo de ejecución (panel de Render)

| Variable | Obligatoria | Valor | Notas |
|---|---|---|---|
| `APP_ENV` | Sí | `production` | Activa las validaciones de producción. Sin Supabase configurado, el arranque falla. |
| `DATABASE_URL` | Sí | Cadena del rol de servicio de la API | **Secreto.** Ver sección 6. |
| `SUPABASE_URL` | Sí | `https://<ref>.supabase.co` | Pública, específica del proyecto. |
| `SUPABASE_JWKS_URL` **o** `SUPABASE_JWT_SECRET` | Sí (una) | URL JWKS o secreto JWT | **Secreto** si es el secreto JWT. No configurar ambos. |
| `DATABASE_APP_ROLE` | No | `portal_app` | Rol al que cambia la API con `SET ROLE`. |
| `DATABASE_POOL_SIZE` / `DATABASE_MAX_OVERFLOW` | No | `2` / `0` | Pool pequeño para 512 MB. |
| `DOCS_ENABLED` | No | `false` | La documentación de la API se desactiva en producción salvo activación explícita. |
| `CORS_ALLOWED_ORIGINS` | No | `[]` | Mismo origen: no hace falta CORS. |
| `WEB_DIST_DIR` | Ya fijada en la imagen | `/app/web/dist` | No cambiar. |
| `PORT` | Lo inyecta Render | — | El contenedor escucha en `0.0.0.0:$PORT`. |

### En tiempo de build (argumentos de Docker)

| Argumento | Público | Valor |
|---|---|---|
| `VITE_AUTH_PROVIDER` | Sí | `supabase` (por defecto). Sin pantallas conectadas al proveedor, la aplicación bloquea el acceso. |
| `VITE_API_BASE_URL` | Sí | `/api/v1` (por defecto). |
| `VITE_SUPABASE_URL` | Sí | URL del proyecto. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave **publicable**. El build rechaza `sb_secret_*` y JWT con rol `service_role`. |

**Cómo llegan los `VITE_*` al build en Render.** Render expone las variables del servicio al build de Docker.
Antes de depender de ello, **verificar en la documentación actual de Render** que las variables marcadas con
`sync: false` en `render.yaml` se pasan como `--build-arg`. Si no fuera así, declararlas como argumentos del build
en la configuración del servicio. En cualquier caso, son públicas: no deben contener secretos.

**Nunca** poner en `VITE_*` contraseñas de base de datos, claves `service_role`, `sb_secret_*` ni el secreto JWT.
Cualquier variable `VITE_*` acaba en el JavaScript que descarga el navegador.

## 5. Límites del plan gratuito

| Límite | Consecuencia | Mitigación |
|---|---|---|
| 512 MB de RAM | Un solo worker de Uvicorn; pool de base de datos pequeño. | `--workers 1`, `DATABASE_POOL_SIZE=2`. |
| Suspensión tras inactividad | La primera petición tras una pausa tarda en responder. | Aceptable para alfa. No usar para operación crítica. |
| Disco efímero | Cualquier archivo escrito en el contenedor se pierde al redeplegar. | Ningún dato se guarda en disco. Persistencia en Supabase. |
| Sin comando pre-deploy | Las migraciones no pueden ejecutarse en el despliegue. | Supabase CLI o CI/CD controlado, fuera del arranque. |
| Horas y ancho de banda mensuales limitados | Puede interrumpirse el servicio al agotarlos. | Revisar el panel de uso de Render. |

Un servicio gratuito **no es operación de producción**. Antes de usuarios reales, usar un plan con garantía de disponibilidad.

## 6. Conexión a Supabase desde Render

- **Rol de la API:** un rol propio sin `BYPASSRLS`, capaz de hacer `SET ROLE portal_app`. No usar `postgres`
  ni `service_role` en la API.
- **Ruta de conexión:** Render puede no tener IPv6 de salida. Si la conexión directa de Supabase requiere IPv6,
  usar el **Session Pooler** de Supabase (compatible con `SET LOCAL` dentro de cada transacción). Confirmar en el
  panel del proyecto qué cadena corresponde a la red de Render antes de configurarla.
- **Pool:** SQLAlchemy con `pool_size=2`, `max_overflow=0`, `pool_pre_ping=True`, `pool_recycle=300`.
  Con 512 MB basta, y evita agotar las conexiones del proyecto de Supabase.
- **Cadena de conexión:** no escribirla en el repositorio ni en `render.yaml`. Se introduce en el panel de Render.

## 7. Frontend en producción: estado actual

El build de producción **exige** `VITE_AUTH_PROVIDER=supabase` con `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY` válidas, y `VITE_API_BASE_URL=/api/v1`. Login, cierre de sesión, renovación,
recuperación de cuenta, guarda de rutas y repositorio HTTP ya están conectados a Supabase Auth.

Antes de desplegar se mantienen como comprobaciones obligatorias:

1. Aplicar y verificar las migraciones pendientes mediante el historial de Supabase CLI.
2. Configurar únicamente una modalidad válida de verificación JWT en Render.
3. Ejecutar `npm run build:verify`, las pruebas y un E2E autenticado contra el entorno autorizado.
4. Mantener `QA_SYNTHETIC_ENABLED=false` y `LOGIX_AI_ENABLED=false` salvo autorización explícita del entorno.

## 8. Paso a un plan de pago sin reestructurar

El mismo Dockerfile sirve para un plan pagado:

1. Cambiar `plan` en `render.yaml` a un plan con más memoria.
2. Aumentar `--workers` en el `CMD` (o usar una variable) y `DATABASE_POOL_SIZE` según la memoria.
3. Añadir un comando pre-deploy de migraciones **solo** si el equipo decide ejecutar migraciones desde Render;
   la recomendación sigue siendo Supabase CLI o CI/CD.
4. Activar `autoDeploy` cuando exista un flujo de revisión.

Nada de esto exige cambios en el código de la aplicación.

## 9. Responsabilidades de integración

| Tarea | Responsable | Estado |
|---|---|---|
| Crear el proyecto de Supabase de desarrollo y el de producción | Equipo de Enrique | Pendiente |
| Aplicar migraciones (Supabase CLI) | Equipo de Enrique, con autorización | Pendiente |
| Crear el servicio en Render y las variables | Equipo de Enrique | Pendiente |
| Recursos oficiales de marca | Logixtic | Pendiente |
| Implementar login real en el frontend | Desarrollo | Pendiente (ver sección 7) |
