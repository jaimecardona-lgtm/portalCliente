# Fase 16 · Diagnóstico de empresas y estrategia de vinculación de IDs

## 1. Por qué las nueve empresas observadas no aparecen en el selector

| Causa | Evidencia |
|---|---|
| El selector lista `public.tenants`, no `logixtic_tenant_discovery`. | `GET /api/v1/staff/tenants` consulta `tenants` bajo RLS. |
| `logixtic_tenant_discovery` es un catálogo de nombres observados. Ninguna migración la copia a `tenants`. | Búsqueda de `INSERT INTO tenants` en `supabase/migrations/`: sin resultados. |
| Las filas observadas no tienen identificador oficial (`external_tenant_id` nulo) y no están verificadas. | Requisito de RLS para personal: `verified_at IS NOT NULL` y `status = 'active'`. |
| Remoto: `tenants` tiene 0 filas. | Auditoría de solo lectura del 12/11/2026. |

Resultado: aunque el alcance global `all_verified_support_tenants` esté concedido, el selector queda vacío hasta que
exista una empresa **verificada** en `tenants`. Esto es intencionado: un nombre observado no es una empresa oficial.

**Comprobado en PostgreSQL local desechable** (`portal_demo_test`, 8 migraciones):
- QA con alcance global ve exactamente `DEMO-A-0001` y `DEMO-B-0001`.
- Una empresa sin verificar no aparece.
- Las filas de `logixtic_tenant_discovery` no aparecen como empresas.

## 2. Estrategia de vinculación con IDs inmutables de Logixtic

1. **Identificador de vínculo:** `tenants.external_tenant_id` guarda el identificador inmutable que emite el SaaS
   Logixtic. Es único (`tenants_external_id_unique`). Nunca se deriva del nombre.
2. **Alta de una empresa real:**
   - Logixtic entrega el identificador oficial por canal escrito.
   - El responsable ejecuta `provision_staff.py verify-tenant --tenant-slug <slug> --external-id <id>`.
   - Ese paso fija `verified_at` y `verified_by` y queda auditado.
3. **Catálogo de observaciones:** `logixtic_tenant_discovery` conserva los nombres observados con `verification_status =
   'unverified'`. Cuando llegue el identificador oficial, se actualiza esa fila con `external_tenant_id` y `verified`
   **y solo después** se crea la fila en `tenants` con el mismo identificador.
4. **Prohibido:** emparejar por similitud de nombre, por correo o por dominio. Cada vínculo lo confirma un identificador
   oficial recibido de Logixtic.
5. **Demostración:** `DEMO-A-0001` y `DEMO-B-0001` son sintéticos. Llevan el prefijo `DEMO-` para distinguirlos de
   cualquier identificador oficial. No deben convivir con empresas reales en el mismo proyecto sin revisión.

## 3. Estado del esquema

- Ninguna migración crea tablas de **cotizaciones**. No se crean datos de cotizaciones en el seed.
- `operation_refs` no tiene origen, destino, ETD/ETA, transporte, booking ni indicador de respuesta pendiente.
  La torre de control necesita esos campos. Ver la propuesta de migración aditiva en el informe de entrega.
