# Validación ejecutada — Fase 01

Todas las cifras de esta página provienen de ejecuciones reales en el equipo de desarrollo (Windows 11, Node 22.22.0, npm 10.6.0). Se listan también las limitaciones.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | Sin errores |
| `npm test` (`vitest run`) | 6 archivos, **51 pruebas aprobadas**, 0 fallidas |
| `npm run build` | Build correcto. Aviso: chunk principal de 634 kB (189 kB gzip) |
| `npm run dev` | Sirve en `http://127.0.0.1:5173` |

## Pruebas unitarias

- `mock-repository.test.ts` — aislamiento por tenant (listados, IDs cruzados, adjuntos, eventos ajenos), comentarios internos ocultos, respuestas con `parentCommentId`, rechazo de respuestas cruzadas entre eventos, cotizaciones vencidas, solicitudes.
- `filters.test.ts` — estados, búsqueda por DO/booking/puerto, pendientes, rango de fechas, combinación AND, orden con vacíos al final, parseo y serialización de la URL.
- `thread-utils.test.ts` — anidado, separación por evento, padre huérfano, orden cronológico, conteo.
- `logix-engine.test.ts` — respuestas sobre datos del tenant, DO ajenos marcados como no disponibles, contexto de operación.
- `demo-auth.test.ts` — credenciales, rechazo de contraseñas arbitrarias, campos vacíos, almacenamiento bloqueado.
- `format.test.ts` — fechas de solo día sin desplazamiento de zona horaria (error corregido durante la validación: "ETA 24-nov" se mostraba como "04-nov").

## Recorrido en navegador (Playwright + Chrome)

Script ejecutado contra el servidor de desarrollo, en escritorio (1440 px) y móvil (390 px). **47 comprobaciones aprobadas, 0 fallidas, 0 errores de consola.**

Cubre: validación y rechazo en login; acceso; carga de torre de control, operaciones, detalle, cotizaciones, detalle de cotización, documentos, solicitudes, nueva solicitud, cuenta, marketplace y 404; filtro por estado que actualiza el contador; DO de otra empresa abierto por URL muestra "Operación no encontrada"; ausencia de scroll horizontal de página en todas las pantallas comprobadas.

Defectos encontrados y corregidos durante la validación:

1. Fechas de solo día desplazadas un día hacia atrás.
2. Scroll horizontal de página causado por un `sr-only` absoluto dentro de la última celda de la tabla de operaciones.
3. Rejilla de filtros aplastada en escritorio.
4. Progreso del detalle DO con un hito de desfase respecto al estado.
5. Migas mostraban IDs internos en lugar del número DO.
6. Botón de Logix tapaba el contenido en móvil.

## Limitaciones de la validación

- No se ejecutó auditoría automatizada de accesibilidad (axe) ni prueba de navegación por teclado completa; se revisó por inspección de código (roles, etiquetas, foco visible, `aria-*`).
- No hay pruebas E2E en el repositorio: el recorrido anterior es un script de verificación local, no está versionado.
- Google Fonts no resolvió en el entorno de prueba (sin internet); las capturas usan la fuente del sistema.
- Las pantallas se revisaron en escritorio y móvil; no se probaron tabletas ni navegadores distintos de Chrome.
