# Fase 15 · Alcance global de QA: procedimiento de aplicación (sin ejecutar)

**Estado:** la migración `20261113000000_staff_global_tenant_scope.sql` está aplicada solo en bases locales
desechables. En remoto está **pendiente de aprobación explícita**. Este documento describe el procedimiento;
ningún paso remoto se ha ejecutado.

## 1. Comprobaciones ya hechas (solo lectura)

| Comprobación | Resultado |
|---|---|
| `supabase migration list --linked` | Historial remoto igual que local para las siete migraciones anteriores. |
| `supabase db push --linked --dry-run` | Solo pendiente: `20261113000000_staff_global_tenant_scope.sql`. |
| Cadena completa en base local nueva (`portal_chain`, PostgreSQL 18) | Las ocho migraciones aplican sin errores. |
| Pruebas de integración sobre `portal_chain` | 28 pasan: personal, alcance global y aprovisionamiento. |

## 2. Qué cambia en remoto (solo esta migración, aditiva)

- `platform_staff`: columnas `tenant_scope` (por defecto `assigned`), `scope_authorized_by`, `scope_granted_at` y una
  restricción que exige referencia de autorización para cualquier alcance global.
- `staff_access_audit`: columna `previous_tenant_id`.
- Funciones: `portal_staff_scope_tenant_ids()` (une alcance global y grants) y
  `portal_staff_previous_context_tenant()` (SECURITY DEFINER, solo `portal_app`).
- No modifica migraciones anteriores ni datos existentes. No toca las nueve observaciones de
  `logixtic_tenant_discovery`.

## 3. Procedimiento de aplicación (cuando se apruebe)

1. Copia de seguridad del esquema remoto (el propietario la hace desde el panel de Supabase o con `pg_dump --schema-only`
   usando la conexión de propietario; no se guarda en el repositorio).
2. Repetir el dry-run y confirmar que solo aparece la migración nueva:
   `supabase db push --linked --dry-run`
3. Aplicar, con autorización escrita:
   `supabase db push --linked`
4. Verificación posterior (solo lectura):
   ```sql
   SELECT column_name FROM information_schema.columns
    WHERE table_name = 'platform_staff' AND column_name IN ('tenant_scope', 'scope_authorized_by');
   SELECT count(*) FROM platform_staff WHERE tenant_scope <> 'assigned';   -- esperado: 0 antes de conceder
   SELECT proname FROM pg_proc WHERE proname IN ('portal_staff_scope_tenant_ids', 'portal_staff_previous_context_tenant');
   ```
5. Verificar que `supabase migration list --linked` muestra las ocho migraciones sincronizadas.

## 4. Concesión a la cuenta QA (después del paso 3)

Con la conexión de propietario, en el terminal del responsable:

```powershell
$env:DATABASE_URL = <cadena de propietario, introducida de forma oculta>
.\.venv\Scripts\python.exe scripts\provision_staff.py grant-scope `
  --user-id <UUID de la cuenta QA> `
  --authorized-by "<referencia escrita de la autorización>" `
  --reason "Soporte y pruebas del portal (alcance global verificado)"
Remove-Item Env:DATABASE_URL
```

Revocación inmediata: `provision_staff.py revoke-scope --user-id <UUID> --reason "<motivo>"`.
Los grants por empresa no se tocan. La revocación surte efecto en la siguiente petición (RLS lee la tabla en cada consulta).

## 5. Reversión

- Revocar el alcance de la cuenta: `revoke-scope` (sección 4).
- Revertir el esquema solo en bases desechables o tras copia: `supabase/rollback/20261113000000_staff_global_tenant_scope.down.sql`.
  En remoto **no** se revierte con ese archivo sin autorización, porque elimina columnas de auditoría.

## 6. Criterios de verificación con la sesión QA real

1. QA descubre todas las empresas verificadas y activas (`GET /api/v1/staff/tenants`).
2. Cambia de empresa desde la barra superior; el cambio exige motivo; `staff_access_audit` registra
   tenant anterior, tenant nuevo, motivo y fecha.
3. No existen filas en `tenant_memberships` para la cuenta QA.
4. Un usuario externo de otra empresa no ve datos de la empresa de QA (RLS de cliente, sin cambios).
5. Tras `revoke-scope`, `GET /api/v1/staff/tenants` deja de listar empresas sin reiniciar nada.
