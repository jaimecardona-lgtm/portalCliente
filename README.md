# Portal de Clientes Logixtic

Portal B2B para clientes de Logixtic: torre de control, operaciones (DO), timeline con conversaciones por evento, documentos, cotizaciones, solicitudes y asistente **Logix**.

> **Estado:** interfaz corporativa con datos sintéticos en desarrollo. Sin backend, autenticación real ni conexión a sistemas productivos.

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
npm run test:e2e    # Playwright, escritorio y móvil (con Chrome instalado: PW_CHANNEL=chrome)
npm run build       # build de producción (requiere VITE_AUTH_PROVIDER y VITE_API_BASE_URL)
npm run build:verify  # build con configuración de verificación + inspección del bundle
npm run preview     # sirve el build generado
```

## Cuenta de desarrollo

No hace falta configurar nada en la terminal. Con `npm run dev`:

1. Abre `http://127.0.0.1:5173/registro` y crea tu cuenta.
2. Entrarás al portal, con tu empresa de prueba asignada.
3. Después, usa `http://127.0.0.1:5173/login`. Para recuperar la contraseña, consulta la bandeja local en `/__local-auth/outbox` (solo desde este equipo).

Los datos se guardan en `apps/web/local/auth/` (ignorado por Git). Detalles, endpoints y límites: `docs/autenticacion-local.md`. Este acceso es solo para desarrollo y nunca forma parte del build de producción.

## Entornos

- **Desarrollo (`npm run dev`)**: presentación local con datos sintéticos. Las credenciales de prueba están documentadas solo para el equipo técnico en `docs/ENTREGA_TECNICA_ENRIQUE.md`.
- **Producción (`npm run build`)**: exige un proveedor de identidad y una API configurados. Sin ellos el build falla, y aun configurado el acceso permanece bloqueado hasta implementar el backend.

## Documentación

- [Entrega técnica para revisión (Enrique)](docs/ENTREGA_TECNICA_ENRIQUE.md)
- [Autenticación local de desarrollo](docs/autenticacion-local.md)
- [Preparación para Supabase](docs/supabase-preparation.md)
- [Arquitectura y decisiones](docs/architecture.md)
- [Validación ejecutada](docs/validation.md)
- [Integración con FastAPI](docs/fastapi-integration.md)
- [Reglas para asistentes](CLAUDE.md)

## Advertencia de seguridad

El aislamiento por tenant del frontend es **presentación y demostración**. La seguridad real (identidad, pertenencia a tenant y permisos por endpoint) debe aplicarla FastAPI en cada solicitud.
