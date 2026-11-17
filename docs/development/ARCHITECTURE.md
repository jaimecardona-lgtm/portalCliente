# Arquitectura objetivo

## Contexto multiempresa

Supabase Auth autentica a la persona. FastAPI resuelve su rol y lista únicamente los tenants permitidos. Para personal interno, el navegador conserva por pestaña solo el UUID seleccionado; antes de reutilizarlo lo confronta con `GET /api/v1/staff/tenants`. El servidor registra y valida cada cambio de contexto. El UUID del navegador nunca concede acceso por sí solo.

TanStack Query separa datos mediante claves que incluyen tenant. Al cambiar de empresa se elimina la caché anterior antes de montar las vistas del nuevo contexto.

## Capas

- React: presentación, estado de consulta y formularios; no decide autorizaciones.
- FastAPI: autenticación, rol, contexto activo, validación y contratos de lectura/escritura.
- PostgreSQL/Supabase: integridad relacional y RLS con el rol limitado `portal_app`.
- Storage: objetos documentales con rutas por tenant y enlaces autorizados de corta duración.
- Adaptadores Logixtic: futura fuente oficial, normalizada sin reemplazar UUID internos ni duplicar tenants.

## Regla de navegación administrativa

Una ruta se monta cuando dispone de un contrato administrativo seguro. Si el módulo aún no lo tiene, muestra una indisponibilidad explícita; no consulta silenciosamente endpoints de cliente ni datos locales.

