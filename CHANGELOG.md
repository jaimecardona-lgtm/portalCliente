# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El versionado sigue [SemVer](https://semver.org/lang/es/) con sufijos de prerelease para hitos internos.

## [0.1.0-alpha.1] — 2026-11-11 · Frontend Foundation & Local Authentication

Primer hito interno, **no desplegable**. Interfaz completa con datos sintéticos y autenticación de desarrollo. No hay backend, ni autenticación real, ni integración con Logixtic.

### Añadido

- **Torre de control** (`/`): indicadores accionables, seguimiento de operaciones por ETA, alertas, rutas activas y actividad reciente.
- **Operaciones** (`/operaciones`): listado con filtros y búsqueda en la URL, columnas configurables, orden, resumen y tarjetas en móvil.
- **Detalle DO** (`/operaciones/:id`): cabecera con ruta, progreso, fechas logísticas y responsable; timeline por evento.
- **Conversaciones por evento**: hilos de comentarios con `eventId` y respuestas anidadas (`parentCommentId`). Los mensajes no cambian el estado de la operación.
- **Información de la empresa** (`/cuenta`): datos generales, direcciones y contactos, en solo lectura.
- **Gestión documental** (`/documentos`): vigentes, por vencer y vencidos; historial. Carga y vista previa solo en desarrollo.
- **Cotizaciones** (`/cotizaciones`, `/cotizaciones/:id`): conceptos, condiciones y decisión solo cuando el estado y la vigencia lo permiten (solo en desarrollo).
- **Solicitudes** (`/solicitudes`, `/solicitudes/nueva`): historial y formulario validado (solo en desarrollo).
- **Asistente Logix**: motor de reglas sobre los datos del tenant activo. Solo en desarrollo; en producción aparece deshabilitado.
- **Registro web** (`/registro`) y **inicio de sesión** con cookie HttpOnly validada por el servidor de desarrollo.
- **Recuperación de contraseña** (`/recuperar-contrasena`, `/restablecer-contrasena`) con enlace de un solo uso de 15 minutos, consultable en una bandeja local solo desde localhost.
- **Perfil** (`/perfil`): consulta, edición del nombre y cambio de contraseña.
- **Textos legales** (`/terminos`, `/privacidad`): borradores estructurados, pendientes de aprobación jurídica.
- **Separación de entornos**: modo local (solo `vite dev`) y modo producción bloqueado. `npm run build` falla sin configuración de proveedor y API.
- **Verificación de bundle** (`npm run build:verify`): comprueba que el bundle de producción no contiene datos sintéticos ni autenticación local.
- **Pruebas**: 88 unitarias (Vitest), 87 E2E de desarrollo y 18 E2E de producción (Playwright).
- **Contratos de autenticación** (`AuthService`, `UserRepository`, `SessionService`, `TenantMembershipRepository`) como tipos, para la migración a Supabase.

### Seguridad

- El servidor de desarrollo solo acepta conexiones y orígenes de localhost.
- Contraseñas con hash scrypt y sal; sesiones y tokens guardados solo como hash.
- Límites de intentos fallidos, límite de tamaño de entrada y tipo de contenido JSON obligatorio.
- El tenant y el rol los fija el servidor; el cliente no los puede elegir.
- Los datos locales de autenticación (`apps/web/local/`) están ignorados por Git.

### Cambiado

- La autenticación de presentación basada en fixtures se sustituyó por cuentas creadas desde el navegador.
- El script `setup:local-user` quedó descontinuado. La configuración del usuario de revisión anterior se importa al almacén JSON sin borrar el archivo.

### Corregido

- Cierre de sesión que dejaba la aplicación bloqueada (redirección renderizada durante el render de la shell).
- Fechas de solo día que se mostraban un día antes.
- Desbordamiento horizontal en la tabla de operaciones.
- Progreso del detalle DO con un hito de desfase respecto al estado.

### Limitaciones conocidas

- Sin backend ni repositorio remoto. Todas las escrituras (cotizaciones, solicitudes, documentos, comentarios) existen solo en el entorno de desarrollo.
- Sin integración con Logixtic: no hay sincronización de operaciones, eventos ni documentos oficiales.
- Sin correo real: la recuperación de contraseña depende de la bandeja local de desarrollo.
- Los adjuntos no se suben ni se almacenan; la vista previa de documentos no está implementada.
- Sin auditoría automatizada de accesibilidad (axe). Verificado solo en Chromium.
- El chunk principal pesa 481 kB (151 kB gzip) y Vite avisa por encima de 500 kB sin gzip.
- Los textos legales son borradores y no constituyen políticas aprobadas.

### Pendiente para pasar a alpha.2

- Supabase Auth y PostgreSQL (ver `docs/supabase-preparation.md`).
- FastAPI con validación de identidad, membresías y permisos (ver `docs/fastapi-integration.md`).
- Repositorio remoto con el mismo contrato `PortalRepository`.
- Definición con Logixtic de la sincronización de datos y de las fuentes de verdad.
