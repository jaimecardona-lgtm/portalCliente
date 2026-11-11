# Validación ejecutada

Todas las cifras provienen de ejecuciones reales en Windows 11 con Node 22.22.0, npm 10.6.0 y Google Chrome instalado. Los comandos se listan para reproducirlos desde `apps/web`.

## Fase 04 — usuario local de revisión

| Comando | Resultado |
|---|---|
| `npm run setup:local-user` (entrada por tubería en la verificación) | Correcto. Valores por defecto aplicados; correo conservado tal cual; contraseña corta rechazada; la contraseña en claro no aparece en el archivo |
| `npm run typecheck` | Sin errores |
| `npm test` | 9 archivos, **72 pruebas aprobadas** (hash, reglas de contraseña, configuración, middleware: origen, bloqueo tras 5 intentos, perfil sin credencial) |
| `npm run build:verify` | Correcto. Bundle verificado sin `__local-auth` ni `reviewer.config` |
| `PW_CHANNEL=chrome npm run test:e2e` | 55 aprobadas. Las 17 de revisión se omiten sin `REVIEWER_E2E_PASSWORD` |
| `REVIEWER_E2E_PASSWORD=… npm run test:e2e -- reviewer` | **16 aprobadas** (8 escenarios en escritorio y móvil) |
| `PW_CHANNEL=chrome npm run test:e2e:prod` | **16 aprobadas**, incluido el endpoint de revisión inexistente en producción |

### Escenarios de revisión verificados

1. Configuración del usuario y contraseña elegida por el usuario (`setup:local-user`).
2. Inicio de sesión con las credenciales configuradas.
3. Rechazo de contraseña incorrecta.
4. Perfil visible: nombre, correo, empresa asignada (Textiles Andinos).
5. Dashboard, operaciones, detalle DO, documentos, cotizaciones y solicitudes.
6. Publicación de un comentario en un evento local.
7. Aislamiento: operación y cotización de otra empresa por URL no disponibles.
8. Solicitud local creada y visible en el historial.
9. Asistente Logix responde con datos de la empresa asignada.
10. Cierre de sesión y bloqueo de rutas protegidas.

### Defectos encontrados y corregidos

1. **El cierre de sesión dejaba la aplicación colgada** (el navegador se caía). Causa: una redirección (`<Navigate>`) renderizada dentro de la shell autenticada mientras la sesión se borraba. Corrección: la shell no renderiza redirecciones, y "Cerrar sesión" navega al login antes de borrar la sesión. Lo detectó la prueba E2E de cierre de sesión.
2. **Redirección con `redirect=` residual** tras cerrar sesión. Corrección: se eliminó el efecto de redirección de la shell; la guarda de acceso queda en `beforeLoad`.
3. **Pruebas de revisión**: selector ambiguo en móvil y una interacción con el menú que requería esperar la animación de apertura.

## Fase 03 — interfaz corporativa y preparación de entrega

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm test` | 8 archivos, **61 pruebas aprobadas** (configuración de acceso, funciones por entorno, control de texto visible) |
| `npm run build` sin configuración | **Falla de forma intencional** con mensaje claro (`falta VITE_AUTH_PROVIDER`) |
| `npm run build:verify` | Correcto. Bundle verificado: 18 archivos, sin datos sintéticos ni autenticación local. Chunk principal 481 kB (151 kB gzip) |
| `PW_CHANNEL=chrome npm run test:e2e` | **55 aprobadas, 1 omitida** (selector de empresa visible desde 1280 px) |
| `PW_CHANNEL=chrome npm run test:e2e:prod` | **14 aprobadas** sobre el build de producción |

### Qué verifican las E2E de producción

- Sin sesión, todas las rutas protegidas redirigen a login.
- El login no muestra cuentas, contraseñas ni textos de demostración.
- Las credenciales sintéticas no crean sesión: el formulario queda deshabilitado.
- El lanzador de Logix no aparece activo fuera de la sesión.
- Sin errores de consola en el login y sin desbordamiento horizontal.

### Qué verifican las E2E de presentación (desarrollo)

- Login, redirección sin sesión y validación de campos.
- Torre de control, filtros que se reflejan en la URL, búsqueda por DO.
- Aislamiento: un DO de otra empresa por URL muestra "no encontrada"; el selector de empresa de QA cambia los datos.
- Hilos de comentarios: responder crea un mensaje con `parentCommentId` del comentario padre dentro del mismo evento.
- Cotizaciones: vencida sin decisión; pendiente vigente con confirmación.
- Formularios, diálogo con Escape y devolución de foco, panel Logix.
- Diez rutas autenticadas sin desbordamiento horizontal ni errores de consola.

### Defectos encontrados y corregidos en esta fase

1. **El bundle de producción incluía fixtures.** La bandera de entorno llegaba a través de constantes y funciones, y el compilador no podía eliminar la rama. Corrección: `import.meta.env.DEV` en los puntos de cruce, y el selector de empresa en su propio módulo con carga diferida. Lo detectó `verify:bundle`.
2. **La prueba de texto visible fallaba al cargar**: usaba `import.meta.url`, que en jsdom no es una URL de archivo. Corregido con la carpeta de trabajo de Vitest.
3. **Nombres sintéticos con la palabra "Demo"** visibles en el dashboard y en la cuenta. Renombrados a nombres ficticios sin esa marca.
4. **Expectativa incorrecta en la prueba de producción**: el lanzador de Logix solo existe dentro de la shell autenticada.
5. **Build de producción sin configuración**: antes compilaba y servía datos locales. Ahora falla con un mensaje explícito.

### Capturas

- Login, dashboard, detalle DO, operaciones, documentos, cotizaciones, solicitudes y panel Logix, en escritorio (1440 × 900) y móvil (390 × 844).
- Antes (fase 02): `scratchpad/shots/before/`. Después (fase 03): `scratchpad/shots/final/`.
- Las capturas de fase 03 provienen del entorno de desarrollo y muestran el selector de empresa de QA. La producción no puede capturarse sin backend.

## Fase 02 — auditoría UX/UI y refinamiento

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm test` | 6 archivos, 51 pruebas aprobadas |
| `npm run build` | Correcto (entonces sin verificación de configuración). Chunk principal 540 kB |
| `PW_CHANNEL=chrome npm run test:e2e` | 53 aprobadas, 1 omitida |

Defectos corregidos: redirección sin sesión que dejaba la aplicación en blanco (causa: `<Navigate>` dentro del layout autenticado; corregido con guarda `beforeLoad`), desbordamiento horizontal por un `sr-only` absoluto en una celda de tabla, tabla recortada con nueve columnas, fechas de solo día desplazadas un día, pruebas frágiles por esperas insuficientes.

## Fase 01 — resumen

51 pruebas unitarias, typecheck y build aprobados en la entrega inicial.

## Limitaciones de la validación

- No hay auditoría automatizada de accesibilidad (axe). Roles, etiquetas, foco y `aria-*` se revisaron por código y con las pruebas E2E.
- Solo Chromium. No se probó Firefox ni Safari.
- El chunk principal sigue por encima de 500 kB sin gzip; el aviso de Vite permanece.
- Las pruebas de producción verifican el bloqueo de acceso, no un flujo de autenticación real: aún no existe.
