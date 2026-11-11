# Portal de Clientes Logixtic

Portal B2B para clientes de Logixtic: torre de control, operaciones (DO), timeline con conversaciones por evento, documentos, cotizaciones, solicitudes y asistente **Logix**.

> **Estado:** Fase 01 — frontend ejecutable en modo **DEMO** con datos sintéticos. No hay backend, autenticación real ni conexión a sistemas productivos.

## Estructura

```text
portalCliente/
├── apps/
│   ├── web/          # SPA React + TypeScript (Vite, TanStack Router/Query, Tailwind v4)
│   └── api/          # Reservado para FastAPI (solo README por ahora)
├── docs/             # Arquitectura, validación y guía de integración
├── CLAUDE.md         # Reglas de trabajo para asistentes de código
└── README.md
```

## Requisitos

- Node.js 22+ (probado con v22.22.0)
- npm 10+ (probado con 10.6.0)

## Comandos (desde `apps/web`)

```bash
cd apps/web
npm install
npm run dev         # http://127.0.0.1:5173
npm run typecheck   # tsc --noEmit
npm test            # Vitest (modo de ejecución única)
npm run build       # typecheck + build de producción
npm run preview     # sirve el build generado
```

## Acceso DEMO

En `/login` aparecen dos cuentas sintéticas, una por empresa. La contraseña DEMO (`Demo-2026`) está visible a propósito: **no es un secreto**. Es solo un guardia de demostración y no implementa seguridad real.

- `ana.torres@andino.demo.test` → Textiles Andinos Demo S.A.S.
- `carla.nino@pacifico.demo.test` → Agroexport Pacífico Demo Ltda.

El selector **SIMULACIÓN** de la barra superior permite cambiar de empresa solo en modo DEMO.

## Documentación

- [Arquitectura y decisiones](docs/architecture.md)
- [Validación ejecutada](docs/validation.md)
- [Integración con FastAPI](docs/fastapi-integration.md)
- [Reglas para asistentes](CLAUDE.md)

## Advertencia de seguridad

El aislamiento por tenant del frontend es **presentación y demostración**. La seguridad real (identidad, pertenencia a tenant y permisos por endpoint) debe aplicarla FastAPI en cada solicitud.
