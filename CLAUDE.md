# CLAUDE.md — Portal de Clientes Logixtic

Guía para trabajar en este repositorio. Léela antes de tocar código.

## Alcance actual

- Fase 01: frontend DEMO en `apps/web`. Sin backend, sin auth real, sin producción.
- Repositorio en la rama `feat/client-portal-v1`. No hacer push ni merge sin pedido explícito.
- No eliminar archivos existentes sin confirmación. No tocar aplicaciones reales de Lovable o Logixtic.

## Comandos

Todos desde `apps/web`:

- `npm run dev` — servidor en `http://127.0.0.1:5173`
- `npm run typecheck` — TypeScript estricto
- `npm test` — Vitest (jsdom)
- `npm run build` — typecheck + build

Antes de dar por terminado un cambio: `typecheck`, `test` y `build` deben pasar.

## Arquitectura (resumen)

- `src/types/domain.ts` — contrato de dominio (Tenant, User, Operation, OperationEvent, EventComment, DocumentRecord, Quote, Request, Attachment). Es el contrato que FastAPI debe respetar.
- `src/services/repositories/` — interfaz `PortalRepository` + implementación mock. **Los componentes no importan fixtures**; solo usan el repositorio vía `useRepository()`.
- `src/data/fixtures/demo-data.ts` — datos sintéticos. No usar nombres, NIT ni correos reales.
- `src/features/<módulo>/` — pantallas y lógica del módulo. Las reglas puras (filtros, hilos, cotizaciones, motor de Logix) están en archivos `.ts` separados y con pruebas.
- `src/components/` — primitivos de UI, timeline reutilizable y marca.
- `src/layouts/` — shell autenticada (sidebar, topbar, drawer móvil).
- `src/routes/router.tsx` — rutas TanStack Router (code-based, sin generación de árbol).

## Reglas de dominio (no negociables)

1. **Todo acceso a datos recibe `tenantId`** y el repositorio filtra por él. Un ID de otra empresa devuelve `null` / lista vacía.
2. **Los comentarios cuelgan de un evento** (`eventId`). Las respuestas usan `parentCommentId` y se conservan.
3. **Un mensaje no cambia el estado** de la operación. Un cambio de estado crea un evento nuevo; no sobrescribe historial.
4. **Comentarios internos** (`visibility: 'internal'`) nunca se devuelven a clientes salvo `includeInternal: true`.
5. **Cotizaciones**: solo se decide si `status === 'Pendiente'` y la vigencia no ha vencido (`quote-rules.ts`).
6. **Fechas de solo día** (`YYYY-MM-DD`) se formatean en UTC y los cálculos de "hoy" usan la zona `America/Bogota` (`lib/format.ts`). No usar `new Date(fecha).toLocaleDateString` directamente.
7. **Logix** responde solo con datos del tenant activo. Sin LLM real en esta fase.

## Estilo y UI

- Colores **solo** mediante tokens de `src/styles/globals.css` (`@theme`). No añadir hexadecimales sueltos en componentes.
- Estado de operación: color + icono + texto (nunca solo color).
- Animaciones de 150–250 ms; `prefers-reduced-motion` se respeta globalmente.
- Diseño responsive: revisar a 390 px y 1440 px. No puede haber scroll horizontal de página.
- Tablas con contenedor `overflow-x-auto`. Elementos `sr-only` dentro de tablas deben tener `relative` en su celda (ver `operations-page.tsx`), o amplían el ancho del documento.
- Sin botones decorativos: si un control aparece, debe tener comportamiento real o estar marcado como futuro (Marketplace).

## Testing

- Unitarias: `*.test.ts` junto al código (`npm test`). Priorizar aislamiento de tenants, hilos, filtros y reglas de cotización.
- E2E: `apps/web/e2e/`, Playwright con dos proyectos (escritorio y móvil). Ejecutar con `PW_CHANNEL=chrome npm run test:e2e` para usar Chrome instalado, o sin variable tras `npx playwright install chromium`. Levanta el servidor de dev automáticamente.
- Las pruebas usan solo datos DEMO. No añadir credenciales reales ni datos de clientes.
- Al esperar elementos, esperar el estado de la página (contador, encabezado), no solo el texto: el primer acceso a un chunk perezoso puede tardar varios segundos.

## Trampas conocidas

- TypeScript 7: `baseUrl` fue eliminado; `paths` se resuelve relativo al `tsconfig`.
- La guarda de sesión va en `beforeLoad` del layout `app`, no en un `<Navigate>` dentro de la shell (ver `docs/architecture.md`).
- Chunk principal de 540 kB: aviso de Vite conocido.
- Una tabla dentro de un contenedor con scroll: cualquier `sr-only` o elemento absoluto dentro de una celda debe llevar `relative` para no ampliar el ancho del documento.
