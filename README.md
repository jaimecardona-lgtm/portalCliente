# Logixtic Client Portal

Portal B2B para clientes de Logixtic: torre de control, operaciones (DO) con seguimiento por evento, conversaciones por evento, documentos, cotizaciones, solicitudes e información de la cuenta, con un asistente de consulta **Logix**.

> **Versión:** `v0.1.0-alpha.1` — hito interno. Interfaz funcional con datos sintéticos y autenticación de desarrollo. **La API existe en local, pero no está desplegada ni conectada a Supabase, y no hay integración con Logixtic.** No usar con clientes reales. Detalles en [CHANGELOG.md](CHANGELOG.md) y en la [entrega técnica](docs/ENTREGA_TECNICA_ENRIQUE.md).

## Funcionalidades disponibles (desarrollo)

| Área | Qué permite hoy |
|---|---|
| Acceso | Registro (`/registro`), inicio de sesión, cierre de sesión, sesión que se mantiene al recargar, recuperación de contraseña con enlace local, perfil y cambio de contraseña |
| Torre de control | Indicadores, seguimiento por ETA, alertas, rutas y actividad |
| Operaciones | Listado con filtros y búsqueda, detalle DO con timeline y conversaciones por evento |
| Documentos | Vigentes, por vencer, vencidos, historial |
| Cotizaciones | Detalle de conceptos y decisión condicionada por estado y vigencia (local) |
| Solicitudes | Historial y formulario validado (envío local) |
| Empresa | Información de la cuenta en solo lectura |
| Logix | Asistente por reglas sobre los datos de la empresa (local) |
| Legal | Términos y privacidad (borradores pendientes de aprobación) |

Las acciones marcadas como "local" solo cambian datos en el entorno de desarrollo. No generan transacciones ni notifican a nadie.

## Stack

- **Frontend** (`apps/web`): React 19, TypeScript estricto, Vite 8, TanStack Router y Query, Tailwind CSS v4, React Hook Form + Zod, Inter autohospedada.
- **Pruebas**: Vitest y Testing Library; Playwright Test para E2E de desarrollo y del build de producción.
- **Backend** (`apps/api`): FastAPI, SQLAlchemy y Alembic con PostgreSQL. Verificación de JWT de Supabase y RLS. Se ejecuta en local.
- **Previsto**: Supabase Auth y PostgreSQL en la nube.

## Requisitos

- Node.js 22 o superior (probado con 22.22.0).
- npm 10 o superior (probado con 10.6.0).
- Para E2E con Chrome instalado: `PW_CHANNEL=chrome`. Sin esa variable: `npx playwright install chromium`.

## Instalación y ejecución

```bash
cd apps/web
npm install
npm run dev              # http://127.0.0.1:5173
```

1. Abre `http://127.0.0.1:5173/registro` y crea tu cuenta.
2. Entrarás al portal, asignado a una empresa sintética.
3. Después, inicia sesión desde `http://127.0.0.1:5173/login`.

Las cuentas se guardan en `apps/web/local/auth/` (ignorado por Git). Detalles en [docs/autenticacion-local.md](docs/autenticacion-local.md).

## Comandos

Desde `apps/web`:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo, con el acceso local activo |
| `npm run typecheck` | Comprobación de tipos (TypeScript estricto) |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | E2E de desarrollo (escritorio y móvil). Levanta el servidor automáticamente |
| `npm run build` | Build de producción. **Falla sin `VITE_AUTH_PROVIDER` y `VITE_API_BASE_URL`** |
| `npm run build:verify` | Build con configuración de verificación y comprobación del bundle |
| `npm run verify:bundle` | Solo inspecciona `dist/` |
| `npm run test:e2e:prod` | E2E sobre el build de producción (requiere `build:verify`) |
| `npm run preview` | Sirve el último build |

## Estructura

```text
portalCliente/
├── apps/
│   ├── web/                 SPA React + TypeScript
│   │   ├── src/             Aplicación (features, services, routes, layouts, types…)
│   │   ├── scripts/lib/local-auth/   Servidor de autenticación de desarrollo
│   │   ├── e2e/, e2e-prod/  Pruebas Playwright
│   │   └── local/           Datos de desarrollo (ignorado por Git)
│   └── api/                 Reservado para FastAPI (sin código todavía)
├── docs/                    Documentación técnica (ver abajo)
├── CHANGELOG.md
├── CONTRIBUTING.md
└── CLAUDE.md                Reglas de trabajo para asistentes de código
```

## Despliegue y contenedor

Un monorepo, una imagen Docker, un servicio HTTP: `Dockerfile` compila React y sirve el frontend y la API FastAPI
desde el mismo origen (`/api/v1`). Plan previsto: un Web Service gratuito de Render (`render.yaml`).

- Guía de despliegue, variables y límites del plan gratuito: [docs/deployment-render.md](docs/deployment-render.md).
- Migraciones: la fuente canónica es `supabase/migrations/` (Supabase CLI). Alembic queda como referencia histórica:
  [docs/database-migration-strategy.md](docs/database-migration-strategy.md).

**Estado:** preparado y no desplegado. No hay servicio en Render ni base remota conectada, y las migraciones
no se han aplicado en ningún proyecto.

## Estado del proyecto

| Pieza | Estado |
|---|---|
| Interfaz (todas las pantallas) | Implementada, con datos sintéticos |
| Autenticación de desarrollo | Implementada. Solo `vite dev` |
| Autenticación real (Supabase Auth) | Pendiente |
| Base de datos | Esquema y RLS probados en PostgreSQL local. Sin proyecto Supabase |
| Backend (FastAPI, `apps/api`) | Implementado en local: 7 rutas bajo /api/v1 (lectura y comentarios) con aislamiento por empresa. No desplegado |
| Adaptador HTTP del frontend | Implementado y probado con respuestas sintéticas. No conectado a las pantallas |
| Pantallas con datos de la API | Pendiente: faltan campos de operación y empresa en la API (ver `docs/fastapi-integration.md`) |
| Integración con Logixtic | Pendiente. Sin conexión |
| Producción | Bloqueada por diseño hasta cumplir los requisitos de la entrega |

## Documentación

- [Entrega técnica para el equipo de Enrique](docs/ENTREGA_TECNICA_ENRIQUE.md): referencia principal de transferencia.
- [Arquitectura](docs/architecture.md)
- [Autenticación local de desarrollo](docs/autenticacion-local.md)
- [Integración con FastAPI (estado real y contratos previstos)](docs/fastapi-integration.md)
- [Preparación para Supabase](docs/supabase-preparation.md)
- [Backend FastAPI: ejecución y pruebas](apps/api/README.md)
- [Validación ejecutada](docs/validation.md)
- [Guía de contribución](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Reglas para asistentes](CLAUDE.md)

## Advertencia de seguridad

El aislamiento por tenant del frontend es de **presentación**: no es seguridad. La autorización real (identidad, pertenencia a la empresa y permisos en cada acceso) debe aplicarla FastAPI, y el acceso local de desarrollo no debe usarse con clientes reales.
