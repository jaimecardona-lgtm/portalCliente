# CLAUDE.md — Portal de Clientes Logixtic

Guía para trabajar en este repositorio. Léela antes de tocar código.

## Alcance actual

- Versión `v0.1.0-alpha.1` (ver `CHANGELOG.md`): interfaz con datos sintéticos en `apps/web`. Sin backend, sin auth real, sin integración con Logixtic, sin producción.
- Para contribuir, sigue `CONTRIBUTING.md` (ramas, Conventional Commits, pruebas y seguridad del repositorio).
- Repositorio en la rama `feat/client-portal-v1`. No hacer push ni merge sin pedido explícito.
- No eliminar archivos existentes sin confirmación. No tocar aplicaciones reales de Lovable o Logixtic.

## Comandos

Todos desde `apps/web`:

- `npm run dev` — servidor en `http://127.0.0.1:5173`
- `npm run typecheck` — TypeScript estricto
- `npm test` — Vitest (jsdom)
- `npm run build` — typecheck + build (en producción falla sin configuración real: intencional; para verificar usar `npm run build:verify`)

Desde la raíz del repositorio:

- `docker build -t logixtic-client-portal .` — imagen única (frontend + API). Ver `docs/deployment-render.md`.
- Migraciones: la fuente canónica es `supabase/migrations/*.sql` (Supabase CLI). **No** usar Alembic sobre un esquema gestionado por Supabase CLI. Ver `docs/database-migration-strategy.md`.
- Nunca ejecutar `supabase db reset` sobre una base compartida, remota o con datos reales. No aplicar migraciones remotas sin autorización.

Antes de dar por terminado un cambio: `typecheck`, `test` y `build` deben pasar.

## Arquitectura (resumen)

- `src/types/domain.ts` — contrato de dominio (Tenant, User, Operation, OperationEvent, EventComment, DocumentRecord, Quote, Request, Attachment). Es el contrato que FastAPI debe respetar.
- `src/services/repositories/` — interfaz `PortalRepository` + implementación mock. **Los componentes no importan fixtures**; solo usan el repositorio vía `useRepository()`.
- `src/data/fixtures/demo-data.ts` — datos sintéticos. No usar nombres, NIT ni correos reales.
- `src/features/<módulo>/` — pantallas y lógica del módulo. Las reglas puras (filtros, hilos, cotizaciones, motor de Logix) están en archivos `.ts` separados y con pruebas.
- `src/components/` — primitivos de UI, timeline reutilizable y marca.
- `src/layouts/` — shell autenticada (sidebar, topbar, drawer móvil).
- `src/routes/router.tsx` — rutas TanStack Router (code-based, sin generación de árbol).

## Política permanente: solo datos reales en presentación, staging y producción

Vigente desde la fase de datos reales. Prevalece sobre cualquier instrucción anterior de este archivo.

- **Prohibido** usar MockData, fixtures sintéticos o respuestas simuladas como fuente de información en presentación, staging o producción.
- **Prohibido** ejecutar `supabase/seed.sql` (datos sintéticos) en presentación, staging o producción.
- **Prohibido** mostrar información ficticia como información operacional, y presentar respuestas predefinidas de IA como consultas reales. El motor de reglas de Logix solo existe en desarrollo y debe identificarse como tal.
- **Prohibido** simular persistencia: cada modificación debe guardarse realmente en la base de datos.
- **Prohibido** desplegar un sistema con autenticación simulada o con sesiones JSON locales.
- Si falta una integración (por ejemplo, Logixtic), la interfaz debe indicar que la información **no está disponible**. No se rellena con datos de ejemplo.
- Los datos sintéticos solo pueden usarse en pruebas automatizadas y en entornos aislados y desechables, nunca expuestos como información real del portal.
- Excepción única: la modalidad **QA interna autorizada** (sección siguiente). Fuera de ella, las prohibiciones de esta política se aplican sin excepción.
- Se mantienen el aislamiento por tenant, la validación de permisos en el servidor y la trazabilidad de cada acción.
- Orden de implementación: (1) estabilizar React + FastAPI; (2) validar Docker y el despliegue único; (3) crear el proyecto real de desarrollo en Supabase; (4) aplicar `supabase/migrations/`; (5) conectar Supabase Auth y PostgreSQL; (6) sustituir el repositorio mock y el login JSON por servicios reales; (7) integrar la aplicación principal de Logixtic; (8) conectar Logix a consultas reales respetando el tenant autenticado; (9) probar los flujos completos de extremo a extremo.

## Modalidad QA interna autorizada (aprobada por el responsable del proyecto)

Aprobada por el responsable de este entorno de desarrollo. Es la única excepción a la política anterior y se limita
a la revisión interna autenticada. Cambiar sus límites exige una nueva aprobación explícita.

1. **Producción empresarial:** prohibido presentar operaciones sintéticas como operaciones reales. Sin excepciones.
2. **QA interno autorizado:** se permiten nombres de empresas del catálogo Logixtic como referencia de escenarios de
   integración, siempre que los datos operativos (operaciones, eventos, solicitudes, clientes) sean sintéticos,
   estén marcados como tales y no puedan confundirse con registros sincronizados desde Logixtic.
3. **Acceso restringido:** Supabase Auth para identidad, permisos de personal en FastAPI y RLS en PostgreSQL. Los datos
   QA solo se muestran con una configuración explícita del backend y del entorno, deshabilitada por defecto.
4. **Prohibido el acceso de usuarios externos** (clientes, registros públicos) a los datos QA.
5. **Prohibida la sincronización** de estos registros hacia el SaaS original de Logixtic, y desde él hacia estos registros.
6. **Señalización permanente:** toda pantalla que muestre operaciones sintéticas muestra «ENTORNO QA · DATOS DE PRUEBA».
7. **Sin verificación oficial falsa:** no se escriben `verified_at` ni `external_tenant_id` para datos QA. El catálogo
   observado se relaciona por identificadores internos, sin declarar identidad verificada en el SaaS.
8. **Autorización por UUID interno** de `tenants`, nunca por slug ni por etiqueta observada.
9. **Sin `client_admin`** para personal QA, RLS activa, y ninguna conexión con `postgres` o `service_role` en la API.
10. **Auditoría** de cada cambio de empresa y de cada acceso, como en producción.
11. **Separación:** la modalidad QA nunca se despliega contra una base con usuarios empresariales reales o integraciones
    productivas. Antes de cada despliegue se comprueba esa condición.

## Entornos y acceso (fase 03)

- `src/config/runtime.ts` decide el modo: `local` (solo `vite dev`) o `blocked` (producción). Producción nunca concede acceso sin proveedor real implementado.
- En código de interfaz, la rama de desarrollo se escribe con `import.meta.env.DEV` literal. Así el compilador elimina fixtures, repositorio local, selector de empresa y motor de Logix del bundle.
- Las funciones incompletas se controlan con `FEATURES`. En producción todas están desactivadas.
- No escribir en la interfaz términos de prototipo o demostración: `src/test/visible-copy.test.ts` lo verifica.
- Credenciales de presentación: solo en `docs/ENTREGA_TECNICA_ENRIQUE.md`. No mostrarlas en pantalla.

## Autenticación local (fase 05)

- Cuentas de desarrollo en `apps/web/local/auth/` (JSON). Se crean desde `/registro`. Ver `docs/autenticacion-local.md`.
- Toda operación de usuario pasa por el servidor de desarrollo (`scripts/lib/local-auth/`). El navegador nunca lee ni escribe el JSON.
- El servidor decide tenant (`tn-andino`) y rol (`client`). No aceptar tenant ni rol del cliente.
- Nunca registrar en logs contraseñas, hashes ni tokens. Sesiones y tokens de recuperación se guardan solo como hash.
- Las rutas de autenticación locales y sus contratos (`src/services/auth/contracts.ts`) deben poder sustituirse por Supabase Auth sin reconstruir las páginas.
- `setup:local-user` quedó descontinuado: no reintroducir un registro por terminal.

## Reglas de dominio (no negociables)

1. **Todo acceso a datos recibe `tenantId`** y el repositorio filtra por él. Un ID de otra empresa devuelve `null` / lista vacía.
2. **Los comentarios cuelgan de un evento** (`eventId`). Las respuestas usan `parentCommentId` y se conservan.
3. **Un mensaje no cambia el estado** de la operación. Un cambio de estado crea un evento nuevo; no sobrescribe historial.
4. **Comentarios internos** (`visibility: 'internal'`) nunca se devuelven a clientes salvo `includeInternal: true`.
5. **Cotizaciones**: solo se decide si `status === 'Pendiente'` y la vigencia no ha vencido (`quote-rules.ts`).
6. **Fechas de solo día** (`YYYY-MM-DD`) se formatean en UTC y los cálculos de "hoy" usan la zona `America/Bogota` (`lib/format.ts`). No usar `new Date(fecha).toLocaleDateString` directamente.
7. **Logix** responde solo con datos del tenant activo. Sin LLM real en esta fase.

## Estilo y UI

- **Marca (obligatorio):** antes de modificar la interfaz, lee `docs/brand/BRAND_SYSTEM.md` (Manual de Marca Corporativa v2.0). El manual y los archivos oficiales no se incorporan al repositorio.
- Colores **solo** mediante tokens de `src/styles/globals.css` (`@theme`). Los cinco colores de marca son `#2296F3`, `#FBBE0A`, `#0F2341`, `#F7801E` y `#6E7D95`; el resto son variaciones por opacidad. No añadir hexadecimales sueltos en componentes ni clases de la paleta por defecto de Tailwind (la paleta está desactivada).
- Naranja solo para alertas (con icono y texto). Nunca fondo de logotipo. Nunca texto blanco sobre amarillo ni blanco sobre azul royal para texto normal.
- Tipografía: Poppins para H1–H3 y eslogan; Inter para el resto. No redibujar el logotipo ni la X: usar solo los recursos oficiales de `apps/web/public/brand/`. Si faltan, no crear sustitutos.
- Logix: casco azul, chaleco amarillo, X visible. No inventar poses ni variantes.
- Estado de operación: color + icono + texto (nunca solo color).
- Animaciones de 150–250 ms; `prefers-reduced-motion` se respeta globalmente.
- Diseño responsive: revisar a 390 px y 1440 px. No puede haber scroll horizontal de página.
- Tablas con contenedor `overflow-x-auto`. Elementos `sr-only` dentro de tablas deben tener `relative` en su celda (ver `operations-page.tsx`), o amplían el ancho del documento.
- Sin botones decorativos: si un control aparece, debe tener comportamiento real o estar marcado como futuro (Marketplace).

## Testing

- Unitarias: `*.test.ts` junto al código (`npm test`). Priorizar aislamiento de tenants, hilos, filtros y reglas de cotización.
- E2E: `apps/web/e2e/`, Playwright con dos proyectos (escritorio y móvil). Ejecutar con `PW_CHANNEL=chrome npm run test:e2e` para usar Chrome instalado, o sin variable tras `npx playwright install chromium`. Levanta el servidor de dev automáticamente.
- Las pruebas usan solo datos sintéticos. No añadir credenciales reales ni datos de clientes.
- Al esperar elementos, esperar el estado de la página (contador, encabezado), no solo el texto: el primer acceso a un chunk perezoso puede tardar varios segundos.

## Trampas conocidas

- TypeScript 7: `baseUrl` fue eliminado; `paths` se resuelve relativo al `tsconfig`.
- La guarda de sesión va en `beforeLoad` del layout `app`, no en un `<Navigate>` dentro de la shell (ver `docs/architecture.md`).
- Chunk principal de 540 kB: aviso de Vite conocido.
- Una tabla dentro de un contenedor con scroll: cualquier `sr-only` o elemento absoluto dentro de una celda debe llevar `relative` para no ampliar el ancho del documento.
