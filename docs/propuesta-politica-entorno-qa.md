# Propuesta de modificación de CLAUDE.md · Entorno QA aislado

**Estado: PROPUESTA. No aplicada.** Requiere aprobación explícita del responsable antes de usarse para cualquier
despliegue. Mientras tanto, rige la política vigente: sin datos sintéticos en presentación, staging o producción.

## Tres entornos, tres reglas

| Entorno | Datos | Acceso | Base de datos |
|---|---|---|---|
| Producción empresarial | Solo datos reales o vacíos. Nunca sintéticos. | Autenticación real y permisos del servidor | Proyecto de producción |
| Entorno QA aislado (esta propuesta) | Sintéticos, etiquetados, sin nombres de empresas reales | Solo personal QA autenticado y autorizado, por UUID | Proyecto separado de producción, sin usuarios ni integraciones reales |
| Desarrollo local | Fixtures y pruebas automatizadas | Local | Base local desechable |

## Condiciones obligatorias del entorno QA

1. **Sin nombres reales.** Empresas, clientes, operaciones y personas tienen nombres neutros (p. ej. «Empresa de
   ejemplo 01»). No se usan etiquetas del descubrimiento de Logixtic ni NIT reales.
2. **Etiqueta visible.** Toda pantalla con datos sintéticos muestra «ENTORNO QA · DATOS DE PRUEBA».
3. **Acceso restringido.** Solo personal QA con autorización escrita y registro en `platform_staff`. Ningún
   `client_admin` ni usuario externo recibe acceso. Un cliente externo recibe 403.
4. **Autorización por UUID interno** de `tenants`, nunca por slug ni por etiqueta observada.
5. **Sin verificación oficial falsa.** No se escriben `verified_at` ni `external_tenant_id` para datos de prueba.
6. **Sin sincronización** hacia Logixtic ni desde Logixtic. Ninguna fecha de sincronización en datos sintéticos.
7. **Sin registro público, sin rutas de depuración, sin fixtures** en la imagen de despliegue.
8. **Auditoría** de cada cambio de empresa y de cada acceso, como en producción.
9. **Separación.** Ningún tenant QA comparte base, credenciales ni usuarios con producción.
10. **Reversible.** Un procedimiento documentado borra únicamente filas con `segment = 'QA_SYNTHETIC_ONLY'`.

## Qué no cambia

- RLS activa. La API usa `portal_api` con `portal_app`, nunca `postgres` ni `service_role`.
- Reautenticación por contraseña para cambiar de empresa.
- Ningún usuario externo recibe permisos nuevos.

## Pasos que requieren aprobación antes de ejecutar

1. Aprobar esta modificación de `CLAUDE.md`.
2. Retirar o aislar las filas actuales con nombres de empresas reales del proyecto `fjfnuttziwhxbjhkdtmk`, tras
   respaldo verificado. Mientras existan, no deben mostrarse en ningún entorno.
3. Cargar la semilla neutra (`supabase/scripts/qa/qa_demo_neutral_seed.sql`) solo en el proyecto QA aislado.
4. Desplegar en Render apuntando únicamente al proyecto QA aislado.

## Riesgo que esta propuesta no resuelve

Mostrar operaciones con nombres neutros a una audiencia externa sigue siendo una demostración de datos ficticios.
Debe presentarse como tal y no como operaciones reales de Logixtic.
