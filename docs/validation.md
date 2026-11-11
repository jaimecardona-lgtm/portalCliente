# Validación ejecutada

Todas las cifras provienen de ejecuciones reales en Windows 11 con Node 22.22.0, npm 10.6.0 y Google Chrome instalado. Los comandos se listan para reproducirlos desde `apps/web`.
## Fase 06 — handoff, documentación de código y checkpoint v0.1.0-alpha.1

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm test` | 10 archivos, **88 pruebas aprobadas** |
| `npm run build:verify` | Correcto. 21 archivos sin cadenas de acceso local |
| `PW_CHANNEL=chrome npm run test:e2e` | **87 aprobadas, 1 omitida** (selector de empresa en móvil) |
| `PW_CHANNEL=chrome npm run test:e2e:prod` | **18 aprobadas** |

### Inspección del repositorio (Git y seguridad)

- Rama `feat/client-portal-v1`, árbol limpio al empezar. Historial de fases 01 a 05 sin reescribir.
- No hay archivos de `apps/web/local/`, `.env`, `node_modules`, `dist`, capturas ni resultados de Playwright en el índice (`git ls-files`).
- `apps/web/local/auth/users.json` está ignorado (`git check-ignore`).
- No hay nombres ni correos personales en el historial (búsqueda en todas las ramas).
- Contraseñas de prueba: aparecen en pruebas E2E, pruebas unitarias y en los fixtures sintéticos. Son cadenas de prueba para cuentas sintéticas (dominio `.example`) y **no son credenciales reales**. Se documentan así en `CONTRIBUTING.md`.
- El remoto `origin` apunta a un repositorio que el responsable indica como **público**: no se ha hecho ningún push.

### Defectos y ajustes de esta fase

1. Copy de la pantalla de enlace caducado: "(duran 15 minutos)" se corrigió a "(caducan a los 15 minutos)".
2. Documentación de código: se añadieron cabeceras de módulo (responsabilidad, dependencias, contrato, errores, seguridad y decisiones no evidentes) a 27 archivos de `auth`, `operations`, `account`, `documents`, `quotes`, `requests`, `services`, `routes` y `scripts/lib/local-auth`, y bloques de función en los puntos clave. No se modificó código ejecutable: `typecheck`, pruebas y build pasan sin cambios de comportamiento.
3. Documentación obsoleta: `architecture.md` describía el inicio de sesión DEMO y el selector "SIMULACIÓN" como si fueran el estado actual. Se reescribió con el estado real.

### Observación de estabilidad

- Una primera ejecución de E2E de desarrollo, justo después de editar muchos archivos, tuvo dos pruebas de sesión con tiempo agotado (1 min). La misma suite, con el servidor caliente, pasó completa. El servidor de cuentas responde en unos 120 ms por registro o login válido. El problema es la compilación en frío del servidor de desarrollo, no la autenticación.

### Limitaciones

- Ninguna prueba cubre un proveedor de identidad real ni un backend: no existen todavía.
- Sin auditoría automatizada de accesibilidad. Solo Chromium.
- El almacén de desarrollo contiene cuentas acumuladas por las pruebas (dominio `pruebas.example`). No se han borrado; el procedimiento está en `docs/autenticacion-local.md`.

## Fase 05 — autenticación web con JSON local

| Comando | Resultado |
|---|---|
| `npm test` | 10 archivos, **88 pruebas aprobadas**: almacén JSON (escrituras concurrentes sin pérdida, sin temporales, persistencia entre instancias), servicio (registro, bloqueo tras 5 intentos, sesiones de 12 h y 14 días, recuperación de un solo uso y caducidad, perfil, cambio de contraseña), HTTP (loopback, orígenes, tamaño, tipo de contenido, bandeja solo local), migración de la configuración anterior |
| `npm run typecheck` | Sin errores |
| `npm run build:verify` | Correcto. 21 archivos sin cadenas de acceso local (`__local-auth`, `passwordHash`, `users.json`, `outbox`) |
| `PW_CHANNEL=chrome npm run test:e2e` | **87 aprobadas, 1 omitida** (selector de empresa en móvil) |
| `PW_CHANNEL=chrome npm run test:e2e:prod` | **18 aprobadas** |

### Flujos verificados en navegador (E2E `auth.spec.ts` y verificación manual)

1. Registro desde `/registro` sin ningún comando; entrada automática al portal.
2. Términos obligatorios; correo repetido; regla y indicador de contraseña.
3. Inicio de sesión tras limpiar la cookie; rechazo de contraseña incorrecta con mensaje genérico.
4. La sesión se mantiene al recargar; la recarga restablece la sesión desde el servidor.
5. Acceso a dashboard y operaciones; bloqueo de rutas protegidas sin sesión.
6. Perfil: consulta, edición del nombre con reflejo en la barra superior, cambio de contraseña y acceso con la nueva.
7. Recuperación: solicitud con respuesta genérica, enlace desde la bandeja local, restablecimiento y enlace invalidado.
8. Términos y privacidad consultables sin sesión; datos del responsable marcados como pendientes.
9. Cierre de sesión y bloqueo posterior.
10. Aislamiento: un DO de otra empresa no está disponible por URL.
11. **Reinicio**: cuenta creada, servidor de desarrollo detenido y levantado de nuevo. El login correcto responde 200, la contraseña incorrecta 401, y el archivo no contiene la contraseña en claro.

### Defectos encontrados y corregidos

1. **Ambigüedad de selectores** en las pruebas (toast y nombre en el perfil; enlaces de términos repetidos). Corregido con selectores exactos.
2. **El selector de empresa de QA** se restablece con la recarga: la sesión real es la del servidor. Comportamiento intencional; la prueba navega internamente.
3. **Pruebas con tiempo agotado** (30 s) en la primera carga tras reiniciar el servidor: compilación de módulos perezosos y scrypt en paralelo. El tiempo por prueba pasó a 60 s en desarrollo. Repetidas con el servidor caliente, pasan.
4. **Documentación**: una sustitución con comillas invertidas en un comando de shell dejó texto corrupto en este registro. Corregido reescribiendo la sección.

### Limitaciones de la validación

- No se probó el envío real de correos (no existe proveedor).
- Los límites de intentos viven en memoria: se reinician con el servidor.
- Las cuentas acumuladas en `apps/web/local/auth/users.json` provienen de las pruebas E2E (dominio `pruebas.example`). Se pueden eliminar deteniendo Vite y borrando esa carpeta.


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
