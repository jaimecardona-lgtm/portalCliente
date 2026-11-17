# Guía breve para agentes

- Leer `CLAUDE.md` y `CONTRIBUTING.md` antes de modificar código. Para UI, leer también `docs/brand/BRAND_SYSTEM.md`.
- Preservar aislamiento por tenant: el UUID activo se valida en FastAPI y cada clave de caché incluye el tenant.
- No usar datos sintéticos fuera de QA interna autorizada ni presentarlos como datos oficiales.
- Las migraciones canónicas viven únicamente en `supabase/migrations/`; nunca ejecutar `supabase db reset` en remoto.
- No desactivar RLS, usar `service_role` en la API, enviar secretos al frontend ni habilitar OpenRouter sin autorización explícita.
- No hacer push, despliegue o cambios remotos destructivos sin autorización específica.
- Trabajar por hitos pequeños. Antes de cada commit: revisar el diff y ejecutar las pruebas proporcionales al cambio.

