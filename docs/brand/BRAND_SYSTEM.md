# Sistema de marca del portal — Logixtic

**Referencia obligatoria:** Logixtic — Manual de Marca Corporativa v2.0 (2026), documento de control interno.
Este documento resume las reglas que aplica el portal. **El manual y los archivos gráficos oficiales no se
incorporan a este repositorio** (es público). Cualquier duda se resuelve con el manual original y con la
empresa (info@logixtic.co).

Antes de modificar la interfaz, lee este documento. `CLAUDE.md` obliga a hacerlo.

## 1. Paleta oficial

Solo estos cinco colores son colores de marca. Blanco y negro puros se permiten en superficies y aplicaciones
que el manual autoriza.

| Token CSS | Valor | Uso en el portal |
|---|---|---|
| `--brand-royal` · `blue` | `#2296F3` Azul Royal | Navegación activa, acentos, foco, iconografía, estados informativos. |
| `--brand-yellow` · `yellow` | `#FBBE0A` Amarillo | Acento de identidad (parte de la X). Nunca texto sobre amarillo. |
| `--brand-navy` · `navy` / `midnight` | `#0F2341` Azul Noche | Superficies institucionales, texto principal, botón principal. |
| `--brand-warning` · `warning` / `danger` | `#F7801E` Naranja alerta | Solo advertencias. Siempre con icono y texto. |
| `--brand-neutral` · `neutral` | `#6E7D95` Gris neutro | Iconos y elementos no textuales. |

Las demás tonalidades del portal son **variaciones por opacidad o mezcla** de estos cinco colores (o de
blanco). No se introducen colores nuevos. Los tokens viven en `apps/web/src/styles/globals.css`.

### Tokens derivados

| Token | Derivación | Uso |
|---|---|---|
| `canvas` | Azul Noche al 4 % sobre blanco | Fondo de la aplicación. |
| `surface-muted` | Azul Noche al 6 % | Filas, áreas secundarias. |
| `line` / `line-strong` | Azul Noche al 12 % / 24 % | Bordes y separadores. |
| `ink-soft` / `ink-muted` | Azul Noche al 82 % / 68 % | Texto secundario. |
| `blue-50` / `blue-100` / `blue-200` | Azul Royal al 10 % / 16 % / 28 % | Fondos de énfasis, anillos de foco. |
| `blue-600` | Azul Royal mezclado con Azul Noche (18 %) | Estado al pasar el cursor del acento. |
| `navy-700` / `navy-500` | Azul Noche mezclado con blanco | Variaciones sobre superficies oscuras. |
| `yellow-50` | Amarillo al 18 % | Fondo de acento suave. |
| `warning-50` / `warning-200` | Naranja al 12 % / 35 % | Fondo y borde de alerta. |

### Prohibiciones

- Morado, verde neón y gradientes rosados.
- Colores decorativos ajenos a la identidad.
- Naranja como fondo del logotipo.
- Amarillo como color dominante o como fondo de texto.
- Emojis como iconografía.
- Redibujar el logotipo o cambiar sus colores.

La paleta por defecto de Tailwind está **desactivada** (`--color-*: initial`). Una clase como `bg-red-500`
no genera CSS.

## 2. Contraste (WCAG 2.2 AA)

Las cifras son aproximadas (relación de luminancia). `src/test/brand-tokens.test.ts` comprueba los pares clave.

| Par | Relación | Uso permitido |
|---|---|---|
| Azul Noche sobre blanco | ≈ 15,7 : 1 | Texto principal. |
| Azul Noche al 68 % sobre blanco | ≈ 5,5 : 1 | Texto secundario. |
| Blanco sobre Azul Noche | ≈ 15,7 : 1 | Texto sobre superficies institucionales. |
| Azul Noche sobre Azul Royal | ≈ 5,0 : 1 | Botón o etiqueta sobre acento. |
| Azul Royal sobre Azul Noche | ≈ 5,0 : 1 | Acento de texto sobre superficie oscura. |
| Azul Noche sobre Amarillo | ≈ 9,3 : 1 | Texto sobre amarillo (único caso permitido). |
| Blanco sobre Azul Royal | ≈ 3,1 : 1 | **No** para texto normal (solo texto grande en negrita). |
| Naranja sobre blanco | ≈ 2,6 : 1 | **No** para texto. Usar icono más texto azul noche. |
| Gris neutro sobre blanco | ≈ 4,2 : 1 | **No** para texto normal. Solo iconos y elementos gráficos. |

Reglas derivadas:

- El estado nunca se transmite solo por color: siempre icono y texto.
- El foco visible usa Azul Royal con contorno de 2 px.
- El movimiento se reduce con `prefers-reduced-motion`.

## 3. Tipografía

| Familia | Uso | Pesos |
|---|---|---|
| **Poppins** (autohospedada, `@fontsource/poppins`) | Títulos H1–H3, eslogan, wordmark (solo el recurso oficial) | H1 Bold 700 · H2 SemiBold 600 · H3 Medium 500 |
| **Inter** (autohospedada, `@fontsource-variable/inter`) | Texto operativo, formularios, tablas, navegación, comentarios, datos logísticos | Regular 400 · Medium 500 · SemiBold 600 |

Las reglas de títulos están en la capa `base` de `globals.css`. Los textos pequeños (microtexto) usan Inter
Medium. No se reproduce el wordmark mediante texto CSS.

Alternativa web-safe autorizada por el manual: Arial / Helvetica Neue (solo si las fuentes autohospedadas no cargan).

## 4. Logotipo e isotipo

- **Logotipo oficial:** wordmark con la X. **Nunca se redibuja.** Versión negativa (blanca) sobre Azul Noche o
  negro; versión azul solo sobre blanco o negro puro.
- **Isotipo:** la X aislada. Favicon, avatares e iconos de aplicación.
- **Área de protección** y proporciones: no estirar, mantener 1:1 en el isotipo.
- **Tamaño mínimo digital:** 120 px de ancho para el logotipo completo; 16 px para el favicon.

### Estado actual en el repositorio

El portal **no incluye todavía los archivos oficiales**. El componente `components/brand/logo.tsx`:

- Carga `/brand/logixtic-logo-negativo.svg`, `/brand/logixtic-logo-principal.svg` e `/brand/logixtic-isotipo.svg`.
- Si un archivo falta, **no dibuja una X ni un logotipo propio**. El isotipo no se muestra y el logotipo
  muestra el nombre en texto plano marcado con `data-brand-asset="pending"`, como marcador provisional.
- El favicon actual es un cuadrado de Azul Noche **sin símbolo**, provisional hasta recibir el isotipo.

Versiones anteriores del proyecto dibujaban una forma propia con degradado. Esa forma se retiró por no
pertenecer a la marca oficial.

Recursos pendientes: ver `apps/web/public/brand/README.md`.

## 5. Logix (copiloto IA)

- Personaje oficial: robot con **casco azul**, **chaleco reflectante amarillo** y **X visible**. Sin fondos
  complejos ni personas acompañantes. No se modifican colores ni visor.
- Poses: el set oficial de seis poses está en el manual. Para nuevos usos hay que solicitar render oficial.
- Logix convive con el logotipo pero nunca lo sustituye en aplicaciones formales.

**Estado actual:** el portal no tiene el avatar oficial. El chat usa un icono genérico provisional (robot de
línea) en un círculo de Azul Noche. No se inventan poses ni variantes del personaje.

Las respuestas de Logix en el portal son reglas locales de desarrollo. No se presentan como respuestas de
la plataforma Logixtic real.

## 6. Iconografía

- Estilo lineal, esquinas redondeadas de 2 px, trazo de 1,5–2 pt, terminaciones circulares.
- Color: Azul Royal o Azul Noche. Nunca iconos rellenos multicolor.
- Iconos oficiales del manual: check, warning, contenedor, barco, avión. El portal usa la biblioteca lineal
  `lucide-react`, que cumple el estilo.
- Ningún emoji en la interfaz.

## 7. Tono de voz

- Directo, técnico, cálido. Frases cortas, verbos activos.
- Español: tuteo (`tú`). Inglés: tono neutro internacional.
- Logix habla en primera persona, con calidez operativa. Propone siguiente paso. Si algo es riesgoso, lo dice.
- Sin superlativos vacíos, sin lenguaje comercial agresivo, sin disculpas excesivas.
- Eslogan institucional: **"Simplify Your Logistics."** En inglés, Poppins Bold, en color permitido. Nunca
  traducido ni sustituido.

## 8. Decisiones visuales y motivo

| Decisión | Motivo |
|---|---|
| Panel de acceso sobre Azul Noche sólido, sin degradados | Los degradados anteriores usaban colores fuera de la paleta. |
| Eslogan en inglés sobre el panel de acceso | Es el texto oficial de la marca; aparece en el panel institucional. |
| Botón principal Azul Noche con texto blanco | Contraste 15,7 : 1. El botón Azul Royal con texto blanco no cumplía AA. |
| Azul Royal como acento y foco, no como fondo con texto blanco | Blanco sobre Azul Royal ≈ 3,1 : 1. |
| Alertas en naranja con icono y texto azul noche | Naranja sobre blanco ≈ 2,6 : 1. El naranja se reserva a advertencias. |
| Éxito e información en Azul Royal | La paleta no tiene verde. El verde neón está prohibido. |
| Paleta por defecto de Tailwind desactivada | Impide colores ajenos a la marca por descuido. |
| Logotipo sin dibujo propio | Las formas no oficiales pueden confundir la identidad. |

## 9. Verificación

- `npm test` incluye `src/test/brand-tokens.test.ts`: valores exactos de la paleta, ausencia de colores
  retirados, ausencia de clases de la paleta por defecto, logotipo sin formas dibujadas y contraste de los pares clave.
- Revisión visual en escritorio (1440 px) y móvil (390 px) antes de cada entrega de interfaz.

## 10. Pendientes de recursos oficiales

| Recurso | Dónde se usa | Responsable |
|---|---|---|
| Logotipo negativo (SVG) | Panel de acceso, barra lateral, pie | Logixtic (marketing) |
| Logotipo principal azul (SVG) | Cabecera en fondos blancos | Logixtic |
| Isotipo X (SVG) | Favicon, avatar, iconos de app | Logixtic |
| Avatar oficial de Logix (render) | Chat del asistente | Logixtic (info@logixtic.co) |
| Fuentes Poppins e Inter | Ya autohospedadas (npm) | Ninguno |
