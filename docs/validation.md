# Validación ejecutada

Todas las cifras provienen de ejecuciones reales en Windows 11 con Node 22.22.0, npm 10.6.0 y Google Chrome instalado. Los comandos se listan para reproducirlos.

## Fase 02 — auditoría UX/UI y refinamiento

| Comando (desde `apps/web`) | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm test` | 6 archivos, **51 pruebas aprobadas** |
| `npm run build` | Correcto. Chunk principal 540 kB (167 kB gzip); cada módulo pesado en chunk propio |
| `PW_CHANNEL=chrome npm run test:e2e` | **53 aprobadas, 1 omitida** (selector de simulación en móvil, visible desde 1280 px) |

### Pruebas E2E (`apps/web/e2e/`)

Se ejecutan en dos proyectos: escritorio 1440×900 y móvil 390×844. Usan solo datos DEMO sintéticos. El servidor de desarrollo se levanta automáticamente.

Cubren:
- Acceso: contraseña incorrecta, acceso correcto, redirección a login sin sesión (guarda de ruta), validación de campos vacíos.
- Torre de control: indicadores y ausencia de scroll horizontal; el enlace "Saltar al contenido" recibe foco con Tab.
- Operaciones: filtro por estado que se refleja en la URL y se conserva tras recargar; búsqueda por DO.
- Aislamiento: DO de otra empresa por URL → "no encontrada"; el selector SIMULACIÓN cambia de empresa (escritorio).
- Conversaciones: responder a un comentario crea un mensaje con `data-parent-id` del comentario padre dentro del mismo evento; validación de mensajes cortos.
- Cotizaciones: vencida sin decisión; pendiente vigente con confirmación.
- Formularios: validación de nueva solicitud antes de enviar.
- Diálogos: se cierra con Escape y devuelve el foco al botón que lo abrió.
- Logix: respuesta sobre operaciones activas; Escape cierra el panel.
- Responsive: diez rutas autenticadas sin desbordamiento horizontal.

### Defectos encontrados y corregidos

1. **Redirección sin sesión colgaba la aplicación.** Al abrir una ruta protegida sin sesión, el router no montaba nada (DOM de 15 elementos, también en producción). Se corrigió con una guarda `beforeLoad` en el layout autenticado; ver `docs/architecture.md`.
2. **Desbordamiento horizontal en operaciones** por un `sr-only` absoluto en la última celda de la tabla. Se corrigió con `relative` en la celda.
3. **Tabla de operaciones recortada** con nueve columnas visibles en 1440 px. Origen y destino se unieron en una columna "Ruta"; tipo queda fuera por defecto.
4. **Fechas de solo día** desplazadas un día (corregido en fase 01, cubierto por pruebas).
5. **Pruebas E2E frágiles** por esperas insuficientes en el primer acceso a chunks perezosos; ahora esperan el estado real de la página y el timeout de `expect` es de 15 s.

### Capturas

Línea base y después, en escritorio y móvil, para dashboard, operaciones, detalle, documentos, cotizaciones, solicitudes, login y panel Logix:

- Antes: `scratchpad/shots/before/`
- Después: `scratchpad/shots/after/`

(Ruta relativa a la carpeta de sesión; no se versionan binarios en el repositorio.)

## Fase 01 — resumen

51 pruebas unitarias, typecheck y build aprobados en la entrega inicial. Detalle en el historial de commits.

## Limitaciones de la validación

- No hay auditoría automatizada de accesibilidad (axe). Roles, etiquetas, foco y `aria-*` se revisaron por código y con las pruebas E2E anteriores.
- Solo Chromium. No se probó Firefox ni Safari.
- Las capturas "después" se tomaron con el servidor de desarrollo; el build de producción se verificó con `vite preview` para la guarda de ruta.
- El chunk principal sigue por encima de 500 kB; el aviso de Vite permanece.
