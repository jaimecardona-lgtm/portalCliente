# syntax=docker/dockerfile:1
#
# Imagen única del Portal de Clientes: React compilado + API FastAPI en un solo proceso HTTP.
# Ver docs/deployment-render.md. Build desde la raíz del repositorio:
#   docker build -t logixtic-client-portal .
#
# Reglas:
# - Ningún secreto entra en la imagen: ni .env, ni JSON locales, ni claves de servicio. Ver .dockerignore.
# - Solo se incluyen valores PÚBLICOS en el build (VITE_*). Las claves de la base de datos y de Supabase
#   se pasan en tiempo de ejecución.
# - Un solo proceso Uvicorn y un solo worker: el plan gratuito de Render tiene 512 MB.

# ---------------------------------------------------------------------------------------------------
# Etapa 1: compilar el frontend. Las herramientas de esta etapa NO llegan a la imagen final.
# ---------------------------------------------------------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /src/apps/web

# Dependencias primero (caché de capas). npm ci usa exactamente package-lock.json.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/web/ ./

# Valores públicos incrustados en el bundle. Nunca poner aquí claves secretas.
#   VITE_AUTH_PROVIDER: "supabase" (único valor reconocido). Requiere la configuración pública de Supabase;
#   sin pantallas conectadas al proveedor, el acceso queda bloqueado en producción.
#   VITE_API_BASE_URL: /api/v1 (mismo origen que el frontend).
#   VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY: públicos por diseño. El build rechaza claves secretas.
ARG VITE_AUTH_PROVIDER=supabase
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_PUBLISHABLE_KEY=
ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# `vite build` (modo producción) ejecuta el guardia de producción de vite.config.ts.
RUN npx vite build

# ---------------------------------------------------------------------------------------------------
# Etapa 2: runtime. Python slim, usuario no root, sin herramientas de compilación de Node.
# ---------------------------------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production \
    DOCS_ENABLED=false \
    WEB_DIST_DIR=/app/web/dist

RUN groupadd --system --gid 10001 portal \
 && useradd --system --uid 10001 --gid portal --home-dir /app --shell /usr/sbin/nologin portal

WORKDIR /app

# Dependencias y paquete de la API. `pyproject.toml` define las dependencias; `app/` es el código.
COPY apps/api/pyproject.toml apps/api/README.md ./
COPY apps/api/app ./app
RUN pip install --no-cache-dir . \
 && rm -rf /app/app /app/pyproject.toml /app/README.md

# Frontend compilado desde la etapa anterior: solo el resultado, nunca el código fuente ni node_modules.
COPY --from=web-build --chown=root:root /src/apps/web/dist /app/web/dist

USER portal:portal

# Render inyecta PORT. En local, por defecto 8000.
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)"

# Un solo proceso y un solo worker. No se ejecutan migraciones aquí: ver docs/database-migration-strategy.md.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT} --workers 1 --no-access-log --proxy-headers"]
