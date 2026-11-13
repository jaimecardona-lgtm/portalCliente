# Fase 17 · Alta de empresas sin integración y primeros registros desde el portal

## Qué cambia

- **Alta sin integración.** Una empresa puede darse de alta desde una etiqueta del descubrimiento de Logixtic,
  sin identificador oficial, sin operaciones y sin eventos. Nace con `integration_status = 'pending_integration'`
  (columna generada desde `verified_at`, así no puede contradecirlo). `external_tenant_id` y `verified_at` quedan
  en NULL.
- **No se confunden identificadores.** La empresa guarda la etiqueta observada (`discovery_observed_label`), nunca el
  UUID del descubrimiento ni un identificador externo. Solo puede existir una empresa por etiqueta.
- **NIT obligatorio y no inventado.** `tax_id` lo aporta la autorización administrativa. Sin NIT no hay alta.
- **Permisos separados.** `tenants.work_pending` (QA y administrador) permite trabajar en empresas dadas de alta
  con asignación explícita. Soporte y desarrollo no la tienen. El alcance global `all_verified_support_tenants`
  **no** incluye empresas pendientes. `records.write` (QA y administrador) permite crear registros.
- **Procedencia.** Las cuentas de cliente y las solicitudes creadas desde el portal guardan `origin = 'portal_manual'`.
  Nada de ello se sincroniza hacia Logixtic.

## Procedimiento de alta (terminal del responsable)

Se ejecuta con la conexión del propietario del esquema, nunca con `portal_api`:

```
apps\api\.venv\Scripts\python.exe scripts\provision_staff.py provision-tenant ^
  --observed-label "<etiqueta exacta del descubrimiento>" ^
  --tenant-slug <codigo-corporativo> ^
  --legal-name "<nombre legal>" ^
  --tax-id <NIT de la autorización> ^
  --authorized-by "<referencia de la autorización>" ^
  --reason "Alta empresarial autorizada"
```

Es idempotente: si la etiqueta ya tiene empresa, responde que ya estaba dada de alta y no crea otra. Un código o un
NIT repetidos se rechazan. Ejecutado dos veces sobre la base local, la segunda no duplica nada.

**Las nueve empresas del descubrimiento** necesitan su NIT y su código corporativo antes de darse de alta. Ninguno
está en el repositorio y no se han inventado.

## Base de datos

Migración `supabase/migrations/20261113000500_tenant_provisioning.sql` (aditiva) y reversión
`supabase/rollback/20261113000500_tenant_provisioning.down.sql`. La reversión se detiene si ya hay empresas dadas de
alta o registros creados desde el portal.

- Políticas nuevas: `client_accounts_staff_insert`, `requests_staff_insert`, `requests_staff_select`. Todas exigen
  el tenant seleccionado por FastAPI, asignación y permiso.
- Se concede `INSERT` sobre `client_accounts` y `requests` a `portal_app`, y la pertenencia `portal_app` a
  `portal_api` solo si ese rol existe. Sin privilegios globales ni RLS desactivada.
- **No aplicada en Supabase remoto.** Antes de aplicarla hay que aprobarla explícitamente.

## Panel de soporte

- El selector muestra la categoría de cada empresa con texto e icono: vinculada con Logixtic, registrada pendiente de
  integración, o empresa de ejemplo (solo local).
- Una empresa sin operaciones muestra «Esta empresa todavía no tiene operaciones registradas».
- Con permiso `records.write` se pueden crear solicitudes y clientes finales, y verlos en el panel.

## Pruebas ejecutadas

Todo sobre una base PostgreSQL local desechable (`portal_prov_test`) con las 13 migraciones aplicadas en orden:

- API: 252 pruebas pasan (incluidas 14 nuevas en `tests/integration/test_tenant_provisioning.py`).
- Interfaz: 260 pruebas pasan, `typecheck` limpio, `build:verify` pasa.
- Reversión: se detiene con datos; en base limpia revierte con código 0.

## Pendiente o no hecho

- **Recorrido completo en el navegador no ejecutado.** Requiere iniciar sesión real de personal, y no tengo acceso a
  esas credenciales. La cobertura actual es de API, base de datos e interfaz por separado.
- **Torre de Control del cliente** no cambia. Un cliente final todavía no tiene membresía en una empresa pendiente.
- **Operaciones y documentos creados desde el portal** no están implementados. Las operaciones DO solo llegan del
  sistema de origen cuando exista un contrato de integración aprobado.
- **Integración con Logixtic** sigue sin conector en el repositorio.
- **Rol `portal_api`.** La concesión de `portal_app` a `portal_api` se hace solo si el rol existe. La reversión no
  la retira, porque puede haber existido antes de la migración.
