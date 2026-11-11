# Arquitectura — Portal de Clientes (Fase 01)

## Stack

| Área | Elección | Versión instalada |
|---|---|---|
| Build | Vite | 8.3.8 |
| UI | React + TypeScript estricto | React 19.3.1, TS 7.0.2 |
| Rutas | TanStack Router (code-based) | 1.170.46 |
| Datos | TanStack Query | 5.107.1 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) | 4.3.5 |
| Iconos | lucide-react | 1.72.0 |
| Formularios | React Hook Form + Zod + resolvers | 7.92.0 / 4.6.7 / 7.0.5 |
| Pruebas | Vitest + Testing Library + jsdom | 5.1.0 / 16.3.3 / 31.0.0 |

Las versiones son las publicadas en el registro npm en la fecha de la sesión; el `package.json` usa rangos `^` y `package-lock.json` fija las exactas.

Se evitó shadcn/ui: los primitivos son propios y ligeros para no heredar la estética de plantilla genérica que el brief pide evitar.

## Capas

```text
Componentes / páginas (features/*)
        │  useRepository(), useSession()
        ▼
PortalRepository (interfaz tipada)          ← services/repositories/portal-repository.ts
        │
        ├── mock-repository.ts (DEMO, en memoria, filtra por tenantId)
        └── (futuro) http-repository.ts → FastAPI
```

- `createRepository('demo' | 'api')` selecciona la fuente. `'api'` lanza un error explícito hasta implementarse, para no mostrar datos falsos creyendo que son reales.
- Las claves de TanStack Query incluyen `tenantId` (`tenantKey(...)`), así la caché nunca mezcla empresas.

## Rutas

| Ruta | Módulo |
|---|---|
| `/login` | Login DEMO |
| `/` | Torre de control |
| `/operaciones` | Listado con filtros en la URL (`?status=…&q=…&sort=…`) |
| `/operaciones/$operationId` | Detalle DO: cabecera, timeline, conversaciones |
| `/documentos` | Vigentes / por vencer / vencidos, historial, carga DEMO |
| `/cotizaciones`, `/cotizaciones/$quoteId` | Listado y detalle con decisión condicionada |
| `/solicitudes`, `/solicitudes/nueva` | Historial y formulario RHF + Zod |
| `/cuenta` | Información de cuenta (solo lectura) |
| `/marketplace` | Vista futura sin acciones |

El layout autenticado (`AppShell`) redirige a `/login` si no hay sesión.

## Timeline y conversaciones

- `EventTimeline` es genérico: recibe `TimelineItem[]` y un render prop `renderConversation`. No conoce operaciones.
- Cada evento tiene su hilo (`EventThread`) consultado por `(tenantId, operationId, eventId)`.
- `buildThread` (`thread-utils.ts`) arma el árbol con `parentCommentId`; un padre de otro evento convierte la respuesta en raíz en lugar de perderla.

## Sesión y tenants

- `SessionProvider` guarda `{ userId, tenantId, simulated }` en `sessionStorage` dentro de try/catch.
- El selector de empresa solo existe en la barra superior, etiquetado como **SIMULACIÓN**, y reemplaza la sesión por la primera cuenta de la empresa elegida.

## Asistente Logix

- `logix-engine.ts` es un motor determinista sobre los datos del tenant activo. Sin LLM.
- Si la pregunta menciona un DO que no pertenece a la empresa, responde que no está disponible.
- `logix-assistant.tsx` toma como contexto la operación abierta cuando la ruta es `/operaciones/:id`.

## Limitaciones conocidas

- Sin code-splitting por ruta: el bundle principal ronda 634 kB (188 kB gzip).
- Google Fonts depende de red; sin internet se usa la fuente del sistema.
- Adjuntos en solicitudes y cargas documentales son solo metadatos en memoria.
- La navegación por teclado y la revisión de contraste se verificaron por inspección del código, no con una auditoría automatizada.
