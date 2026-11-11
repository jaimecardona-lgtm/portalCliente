# Guía de contribución

Esta guía aplica a todo el repositorio `portalCliente`. Léela antes de tu primer cambio y revísala cuando cambie el flujo de trabajo.

## 1. Antes de empezar

- Lee `README.md`, `docs/ENTREGA_TECNICA_ENRIQUE.md` y `docs/architecture.md`.
- Revisa `CLAUDE.md` si usas asistentes de código: contiene reglas de seguridad y de entorno que también aplican a personas.
- **El repositorio es público.** No subas datos reales de clientes, credenciales, tokens, capturas con información privada ni archivos confidenciales. Ver la sección 6.

## 2. Ramas

| Prefijo | Uso |
|---|---|
| `feat/` | Funcionalidad nueva. Ejemplo: `feat/quote-attachments`. |
| `fix/` | Corrección de un defecto. |
| `docs/` | Solo documentación. |
| `test/` | Solo pruebas. |
| `chore/` | Herramientas, dependencias o configuración sin efecto funcional. |
| `refactor/` | Cambio interno sin efecto funcional. |

- La rama de trabajo activa del hito es `feat/client-portal-v1`. Las ramas nuevas parten de `main`.
- Nombres en minúsculas, separados por guiones. Una rama, un tema.
- No reescribas ramas compartidas. No uses `git push --force` sobre `main` ni sobre ramas de revisión.

## 3. Commits (Conventional Commits)

Formato del título:

```text
<tipo>(<ámbito>): <descripción en imperativo, sin punto final, máximo 72 caracteres>
```

Tipos permitidos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `build`, `ci`.

Ámbitos habituales: `web`, `auth`, `operations`, `documents`, `quotes`, `requests`, `account`, `logix`, `repo`, `code`, `handoff`.

El **cuerpo** es obligatorio en cambios de más de una línea y debe:

1. Explicar **qué** cambia y **por qué**, en párrafos cortos.
2. Indicar si hay impacto en seguridad, tenants, datos o entornos.
3. Mencionar pruebas afectadas cuando las haya.
4. Incluir los trailers de autoría que correspondan.

Ejemplo:

```text
fix(auth): keep session cookie scoped to loopback requests

The local auth middleware accepted any Origin header. Requests
from non-local origins are now rejected before the body is read.

No change to the production bundle. Covered by local-auth.test.mjs.
```

Reglas:

- Un commit por responsabilidad. No mezcles documentación, funcionalidad y formato.
- Prohibido usar títulos como `updates`, `changes`, `final`, `fix everything` o `wip`.
- No hagas squash de commits de hitos ya entregados.
- Revisa `git diff --cached` antes de confirmar.

## 4. Documentación

- Cada módulo importante explica su responsabilidad, dependencias, contrato de entrada y salida, errores, reglas de seguridad y decisiones no evidentes.
- Usa TSDoc (`/** … */`) en TypeScript y comentarios de documentación en JavaScript.
- No escribas comentarios redundantes (`// incrementa contador` sobre `counter++`).
- **Nunca** comentes contraseñas, tokens, cookies, hashes ni datos personales, ni siquiera de ejemplo.
- Describe capacidades reales. Si algo aún no existe, indícalo como pendiente. No afirmes integraciones que no están hechas.
- Cuando cambie un contrato público, actualiza la documentación en el mismo commit o en uno inmediatamente posterior.

## 5. Pruebas antes de confirmar

Desde `apps/web`:

```bash
npm run typecheck        # siempre
npm test                 # siempre
npm run build:verify     # cuando cambie código de la aplicación o de scripts
npm run test:e2e         # cuando cambie una pantalla, una ruta o el flujo de acceso
npm run test:e2e:prod    # cuando cambie el build, la guarda de acceso o la configuración de entorno
```

- No elimines ni debilites una prueba para que pase. Si falla, investiga la causa y repórtala.
- Las pruebas E2E crean sus propias cuentas sintéticas. No deben depender de datos precargados ni de contraseñas guardadas en el repositorio.
- Si una prueba falla por tiempo de compilación en frío, repite con el servidor caliente y anota la causa en la descripción del cambio.

## 6. Seguridad del repositorio

Antes de cada commit:

```bash
git status --short
git check-ignore -v apps/web/local/auth/users.json   # debe estar ignorado
```

Nunca se versiona:

- `apps/web/local/` (datos de desarrollo y cuentas).
- Archivos `.env` con valores reales.
- `node_modules/`, `dist/`, `test-results/`, `playwright-report/`.
- Capturas de pantalla con información personal o de clientes.
- Hashes, contraseñas, tokens o cookies, ni siquiera de prueba fuera de las pruebas automatizadas.

Si descubres un archivo sensible versionado: **detente**, no lo borres en silencio, avisa al responsable del hito y reporta la ruta. La limpieza del historial se decide en equipo.

## 7. Pull Requests

1. Parte de una rama actualizada desde `main` o desde la rama de hito acordada.
2. Describe el cambio en el cuerpo de la PR: contexto, decisiones, impacto en seguridad y en tenants, y pruebas ejecutadas con su resultado.
3. Incluye la lista de verificación:
   - [ ] Typecheck, pruebas unitarias y, si aplica, E2E ejecutados.
   - [ ] Documentación actualizada.
   - [ ] Sin datos sensibles ni archivos locales en el diff.
   - [ ] Sin cambios no relacionados con el objetivo.
4. Solicita revisión de al menos una persona del equipo técnico.
5. Mantén la PR pequeña. Si supera unos 400 cambios significativos, divídela.

## 8. Criterios de revisión

Una PR se aprueba cuando:

- Cumple las reglas de commits y ramas de esta guía.
- No introduce ni expone datos sensibles.
- Mantiene el aislamiento por tenant: ninguna lectura omite el `tenantId`, y ninguna URL permite acceder a datos de otra empresa.
- No hace que la autenticación de desarrollo llegue al build de producción.
- Las pantallas siguen siendo responsive y accesibles por teclado.
- El texto visible no presenta como real algo que no lo es (integraciones, envíos, transacciones).
- Las pruebas nuevas cubren el comportamiento cambiado.

## 9. Publicación

- Ningún miembro del equipo hace `push` a un repositorio público sin autorización explícita del responsable del hito.
- Los hitos se etiquetan con su versión (`v0.1.0-alpha.1`) solo después de que el repositorio sea privado y se hayan revisado los commits.
