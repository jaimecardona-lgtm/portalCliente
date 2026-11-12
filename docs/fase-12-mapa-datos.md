# Fase 12 — Mapa de datos, brechas reales y estado

**Alcance de este documento:** fase 12A (estabilización) y preparación segura de 12B (modelo multitenant) y 12C
(integración con datos reales). No hay contrato oficial de Logixtic disponible en los repositorios revisados, así que
la sincronización no está implementada ni activa.

## 0. Estado del repositorio

- Rama: `feat/supabase-auth-integration`. Sin push, merge ni despliegue.
- **Cambios sin commit:** las fases 11B y 11C siguen sin commit porque el entorno denegó la creación de commits en la
  fase anterior. No se reintentó. La fase 12 añade más cambios sin commit (ver sección 9).
- `.env` de la API y `.env.local` del frontend: ignorados por Git. Ver la fase 11C.

## 1. Condiciones previas: re-verificadas hoy

| Condición (auditoría anterior) | Estado hoy | Cómo se verificó |
|---|---|---|
| Hostname de `DATABASE_URL` no resuelve | **Sigue sin resolver** | Resolución DNS desde la API (sin imprimir el host) |
| Registro público de Supabase Auth activo | **Sigue activo** (`disable_signup: false`) | Endpoint público `/auth/v1/settings` con la clave publicable |
| Confirmación de correo | Activa (`mailer_autoconfirm: false`) | Mismo endpoint |
| `portal_api` existe | **No verificable** desde aquí: no hay conexión válida | Requiere la cadena del Session Pooler real |
| 8 tablas, 12 políticas RLS, `portal_app` sin LOGIN ni BYPASSRLS | Verificado por el responsable en la fase 11B | Auditoría estructural del responsable |

No modifiqué ningún rol ni ajuste remoto.

## 2. Modelo de datos actual (migraciones aplicadas)

| Tabla | Clave | Pertenece a | Visible para el portal (antes de esta fase) |
|---|---|---|---|
| `tenants` | `id`, `slug` | Empresa que usa Logixtic (nivel A) | Empresas con membresía activa |
| `profiles` | `id` = `auth.users.id` | Persona | Su propio perfil |
| `tenant_memberships` | `(user_id, tenant_id)` | Persona en una empresa | Las suyas |
| `operation_refs` | `(tenant_id, external_id)` | Operación (DO) de Logixtic | **Todas las del tenant** (brecha B1) |
| `operation_events` | `(tenant_id, external_event_id)` | Evento de una operación | Eventos `client` del tenant |
| `event_comments` | `id`, `parent_comment_id` | Comentario de un evento | Comentarios `client` del tenant |
| `requests` | `(tenant_id, number)` | Solicitud del cliente | Todas del tenant |
| `attachments` | `storage_path` | Adjunto | Todos del tenant |

Todas las claves compuestas que impiden referencias cruzadas entre empresas están en la migración `20261111000000_foundation`.

## 3. Brechas reales

| # | Brecha | Riesgo | Tratamiento |
|---|---|---|---|
| B1 | **No existe el cliente final.** Un miembro de un tenant ve todas sus operaciones, aunque pertenezcan a otro cliente final. | Alto: fuga entre clientes de la misma empresa | Resuelta en la migración `20261112000000_client_scope` (nivel B) |
| B2 | No hay identificadores oficiales de tenant de Logixtic. El `slug` lo define el portal. | Alto: no se puede vincular un tenant real sin inventar códigos | Catálogo con `external_tenant_code` nulo hasta confirmación (sección 5) |
| B3 | No hay procedencia de sincronización (qué versión del origen, cuándo y en qué ejecución). | Medio: sin trazabilidad ni detección de cambios | Columnas `source_updated_at`, `source_version`, `sync_run_id` y tabla `sync_runs` |
| B4 | La API v1 no expone operaciones completas, documentos ni cotizaciones. | Alto para la experiencia | Sin cambios: las pantallas muestran "no disponible" |
| B5 | El frontend conserva repositorios mock en desarrollo. En modo Supabase no se usan, pero el código sigue en el bundle de desarrollo. | Medio | Pendiente (sección 8). |
| B6 | **Registro público activo** en Supabase Auth. | Alto: cualquiera podría crear una cuenta | Pendiente del responsable en el panel |
| B7 | `portal_api` no verificado. La DATABASE_URL actual no resuelve. | Bloqueante para la API real | Pendiente (sección 6) |
| B8 | El aprovisionamiento no asignaba cliente final: una persona nueva no veía operaciones. | Medio | Corregido: el aprovisionamiento acepta cliente final y asigna la operación |

## 4. Nivel B: decisiones de la migración `20261112000000_client_scope`

- **Membresía de cliente:** `client_memberships (client_account_id, user_id)` con `role` `client_admin` o `client_viewer`.
  Una clave compuesta `(user_id, tenant_id)` hacia `tenant_memberships` impide asignar a un cliente a alguien que no
  es miembro del tenant. Una segunda clave compuesta impide que la cuenta pertenezca a otra empresa.
- **Operación:** `operation_refs.client_account_id` (nullable). Una operación sin cliente **no es visible** para el portal.
- **Visibilidad:** operaciones, eventos, comentarios y solicitudes solo para el cliente asignado. Ser miembro del tenant
  ya no basta. La membresía de tenant debe estar activa (la función de contexto también lo comprueba).
- **Comentar:** solo `client_admin` del cliente de la operación. Antes podía comentar cualquier miembro del tenant. Es un
  cambio de comportamiento intencionado.
- **Solicitudes y adjuntos:** visibles para quien los creó o cuando la operación asociada es del cliente del usuario.
- **Administración:** `sync_runs` tiene RLS activa y **ningún privilegio** para el portal (se verifica en pruebas). El
  catálogo de tenants no está en esta migración: ya existe en remoto como `logixtic_tenant_discovery` (ver
  `docs/fase-12c1-reconciliacion.md`).
- **Reversión:** `supabase/rollback/20261112000000_client_scope.down.sql`. Probada en base desechable: vuelven las 12
  políticas originales y desaparecen las tablas nuevas.

**Qué no hace esta migración:** no activa ningún tenant, no crea clientes ni membresías reales, no inserta datos y no se
aplicó en ningún entorno remoto.

## 5. Catálogo de tenants observados (no verificados)

Nombres tomados de una captura de la interfaz de Logixtic. **No son identificadores, no son una API y no representan
la lista completa.** No se asigna ningún código, UUID, NIT, dominio ni configuración.

| Nombre observado | Confirmar con la fuente oficial | Estado en el catálogo |
|---|---|---|
| CLM CARGO | Código oficial, tipo (productivo / prueba / demo) | `pending_verification` |
| Capacity Tenant 01 | Ídem | `pending_verification` |
| Capacity Tenant 02 | Ídem | `pending_verification` |
| Capacity Tenant 03 | Ídem | `pending_verification` |
| Demo Logixtic | Ídem; probable demostración | `pending_verification` |
| D´MAG LOGISTIC SAS | Ídem | `pending_verification` |
| Global Trade Business | Ídem | `pending_verification` |
| ITALIAN SHIPPING | Ídem | `pending_verification` |
| Line Cargo S.A.S. | Ídem | `pending_verification` |

**Decisión del responsable:** cuáles son productivos y cuáles de prueba o demostración. Ningún tenant pasa a `confirmed`
sin código oficial, empresa del portal vinculada y fecha de verificación (restricción de la tabla).

Plantilla de carga, para ejecutar **solo** con autorización y valores reales del responsable (no incluida en migraciones):

```sql
-- Ejecutar como propietario, en el proyecto autorizado, con valores de la fuente oficial.
UPDATE public.logixtic_tenant_discovery   -- nombre real remoto; verificar columnas antes (ver 12C.1)
SET external_tenant_code = '<código oficial>',
    environment = '<production|demo|test>',
    status = 'confirmed',
    tenant_id = (SELECT id FROM tenants WHERE slug = '<slug del portal>'),
    evidence_reference = '<referencia documental, sin datos personales>',
    verified_at = now(),
    updated_at = now()
WHERE observed_name = '<nombre observado>' AND status = 'pending_verification';
```

## 6. Contrato de integración con Logixtic

**Estado: no disponible.** En los repositorios revisados (`portalCliente` y `quick-build-phase`, rama
`feat/logixtic-staging-integration`) no hay especificación OpenAPI, Swagger ni documentación de la API de la aplicación
principal de Logixtic. Lo que existe:

- `docs/zenox-integration-strategy.md` describe la integración del **frontend** Zenox, no la API del SaaS.
- Las URLs de `logixtic.co` y `diagnosticoroilogixtic.lovable.app` son del sitio comercial, no de la plataforma operativa.

**Operaciones pendientes del responsable** (no se inventan endpoints):

1. Confirmar la fuente oficial: API, exportación o base de datos de la aplicación principal.
2. Documentación de autenticación de esa fuente (tipo de credencial, alcance y rotación).
3. Campos de tenants, clientes, DO, estados, eventos, cotizaciones y documentos, con identificadores inmutables.
4. Política de datos internos (qué no puede salir hacia el portal).

**Adaptador diseñado para cuando llegue la fuente:** la sincronización escribe solo en tablas de referencia con
procedencia (`sync_run_id`, `source_version`, `source_updated_at`). Las pantallas siguen leyendo `PortalRepository`.
No se presenta como activa hasta probarla contra la fuente real.

## 7. Logix: inventario de reutilización (sin copiar código)

Referencia: `quick-build-phase`, rama `feat/logixtic-staging-integration`. Solo se comprobó la existencia de los archivos
indicados en la directiva; **no se ha analizado su contenido** ni se han copiado.

| Archivo de referencia | Existe en la rama | Estado |
|---|---|---|
| `backend/app/integrations/openrouter_client.py` | Sí | Pendiente de análisis |
| `backend/app/integrations/embeddings.py` | Sí | Pendiente de análisis |
| `backend/app/services/agent_orchestrator.py` | Sí | Pendiente de análisis |
| `backend/app/services/rag_retriever.py` | Sí | Pendiente de análisis |
| `backend/app/services/knowledge_service.py` | Sí | Pendiente de análisis |
| `backend/app/tools/registry.py` | Sí | Pendiente de análisis |
| `backend/app/core/config.py` | Sí | Pendiente de análisis |
| `src/components/experience/AgentWidget.tsx` | Sí | Pendiente (depende de TanStack Start) |
| `src/components/site/LogixAI.tsx` | Sí | Pendiente (depende de TanStack Start) |
| `src/lib/agent.functions.ts` | Sí | Pendiente (función de servidor de TanStack Start) |
| Migración RAG de referencia | `supabase/migrations/20261102000300_rag_pgvector.sql` | Solo referencia: no se copia |

**Paquete de habilidades `logixtic-skills.zip`:** contiene `logixtic-core` (con 5 documentos de referencia) y seis
habilidades comerciales, en 22 entradas. Está en `C:\Users\maura\Downloads\variables de entorno logixtic\`, **fuera del
repositorio**. No se ha extraído. La carpeta contiene además un `.txt` con nombre de variables de entorno que no se ha
abierto: su contenido puede ser sensible y debe revisarlo el responsable antes de usarlo.

## 8. Estado del runtime frontend (12C)

- En modo `supabase` la aplicación no usa el repositorio mock.
- Pendiente: retirar el repositorio mock y sus fixtures del código de desarrollo, y eliminar los fallbacks silenciosos.
  No se hizo en esta vuelta para no mezclarlo con la verificación de la migración.

## 9. Cambios realizados en esta fase (sin commit)

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261112000000_client_scope.sql` | Nueva migración: nivel B, catálogo, sincronización, RLS nueva |
| `supabase/rollback/20261112000000_client_scope.down.sql` | Reversión probada |
| `apps/api/app/services/provisioning.py` | Cliente final opcional y operación asignada a él |
| `apps/api/scripts/provision_dev.py` | Argumentos `--client-legal-name`, `--client-tax-id`, `--client-role` |
| `apps/api/tests/conftest.py` | Fixture con dos clientes en A y uno en B |
| `apps/api/tests/integration/test_client_scope.py` | Pruebas nuevas de aislamiento por cliente |
| `apps/api/tests/integration/test_first_flow.py`, `test_rls.py` | Expectativas ajustadas al nuevo modelo |

## 10. Verificación

Base desechable de PostgreSQL local (no remota), con todas las migraciones de `supabase/migrations/` en orden y el seed
sintético (solo en base desechable). Resultados:

- Migraciones aplicadas en orden: sí, sin errores.
- Suite de la API con base migrada: **124 pasadas, 1 omitida** (la omitida solo se ejecuta en Supabase).
- Lint y formato de la API: pasan.
- Reversión probada en base separada: 14 políticas con la migración y 12 tras la reversión.

## 11. Pendientes para la siguiente vuelta

1. Commit local de todo el trabajo sin commit (fases 11B, 11C y 12). Bloqueado hasta autorización explícita.
2. Desactivar el registro público en el panel. Lo ejecuta el responsable.
3. Crear `portal_api` y verificar el Session Pooler real. Lo ejecuta el responsable con su autorización.
4. Confirmar la fuente oficial de Logixtic y su contrato (sección 6).
5. Decidir el estado de cada tenant observado (sección 5).
6. Análisis del código de referencia de Logix y de las habilidades (sección 7).
7. Retirar el repositorio mock del runtime de desarrollo (sección 8).
8. Actualizar README y `CLAUDE.md`. Se dejaron sin cambiar: `CLAUDE.md` es una instrucción del proyecto y cambiarla
   requiere su aprobación.
