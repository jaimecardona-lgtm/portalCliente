# Estado de desarrollo

Actualizado: 2026-11-17.

## Hito activo

Estabilización del primer flujo vertical administrativo.

## Confirmado

- Base de trabajo: `deploy/qa-mvp-2026-11-13`, commit `49e03b5`.
- Rama local aislada: `codex/portal-integral-2026-11-17`.
- Cuenta administrativa y creación QA ya tienen contratos FastAPI específicos.
- Operaciones comparten la definición de agregados; Capacity Tenant 01 debe producir 20 totales, 8 activas y 4 en movimiento desde los datos.
- Logix usa `POST /api/v1/logix/chat` y limita el tenant en el servidor.

## Completado en el primer hito

- `/cuenta` y `/solicitudes/nueva` ya no son sustituidas por el aviso genérico de personal.
- El detalle de operación se decide con el tenant administrativo activo, no con la mera existencia de una sesión.
- El UUID seleccionado persiste entre rutas, recargas y pestañas mediante una preferencia ligada al usuario; antes de restaurarlo se revalida contra la lista autorizada del servidor.
- La presentación local no monta Logix ni simula respuestas operativas.
- Verificación: 287 unitarias frontend, typecheck, build de producción y 28 E2E de escritorio aprobados. Backend: 89 unitarias aprobadas.

## En curso

- Verificar con una sesión Supabase real que `GET /api/v1/staff/tenants` devuelve los nueve tenants autorizados.
- Recorrer el flujo vertical real de Capacity Tenant 01 y contrastar 20 totales, 8 activas y 4 en movimiento.
- Validar Cuenta y Logix desde el navegador autenticado.

## Hito Logix de solo lectura

- Implementadas herramientas acotadas: `get_dashboard_summary`, `list_operations`, `get_operation_detail`,
  `get_operation_events`, `list_requests` y `get_tenant_profile`.
- El tenant lo inyecta FastAPI después de validar identidad, visibilidad y contexto reautenticado; ninguna herramienta
  acepta SQL ni un tenant elegido por el modelo.
- “¿Qué significa ETA?” se clasifica como conocimiento general; una pregunta sobre la ETA de una operación permanece privada.
- Verificación: 92 unitarias backend aprobadas y lint dirigido limpio. Siete integraciones de Logix omitidas por ausencia
  explícita de `PORTAL_TEST_DATABASE_URL`; no se ejecutaron contra Supabase compartido.

## Bloqueos externos conocidos

- La aplicación remota de migraciones requiere revisar el historial de Supabase con credenciales autorizadas.
- OpenRouter permanece deshabilitado hasta autorizar explícitamente el procesamiento externo y su política de retención.
- Documentos y Cotizaciones todavía no tienen el flujo administrativo integral requerido por sus fases.

