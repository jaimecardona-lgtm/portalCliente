import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Regla de marca (Manual de Marca Corporativa v2.0). Estas pruebas fallan si alguien reintroduce colores
 * ajenos, la paleta por defecto de Tailwind o un logotipo dibujado a mano.
 * Ver docs/brand/BRAND_SYSTEM.md.
 */
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const GLOBALS = join(SRC, 'styles', 'globals.css')

// Los cinco colores oficiales. Nada más se declara como color base.
const BRAND = {
  royal: '#2296F3',
  yellow: '#FBBE0A',
  navy: '#0F2341',
  warning: '#F7801E',
  neutral: '#6E7D95',
}
// Valores retirados de versiones anteriores: no deben aparecer.
const RETIRED = ['#2563EB', '#091629', '#12233D', '#22C7F2', '#10B981', '#22C7F2']
// Paleta por defecto de Tailwind (familias de color) que no pertenece a la marca.
const DEFAULT_PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration)-(?:emerald|green|red|rose|amber|yellow|orange|indigo|violet|purple|fuchsia|pink|sky|teal|cyan|lime|slate|gray|zinc|neutral|stone|blue)-\d{2,3}\b/

// Tonos de azul royal definidos como tokens en globals.css (tints por opacidad).
const BRAND_BLUE_TOKENS = /-blue-(?:50|100|200|600)$/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return [full]
  })
}

function sourceFiles(): string[] {
  return walk(SRC).filter((f) => /\.(tsx|ts|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
}

function read(file: string): string {
  return readFileSync(file, 'utf8')
}

/** Mezcla un color sobre blanco con una opacidad (0–1). Para comprobar contraste de las variaciones. */
function mixOverWhite(hex: string, alpha: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const mixed = c.map((v) => Math.round(v * alpha + 255 * (1 - alpha)))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('paleta oficial', () => {
  const css = read(GLOBALS)

  it('declara exactamente los cinco colores de marca en :root', () => {
    for (const hex of Object.values(BRAND)) {
      expect(css.toLowerCase()).toContain(hex.toLowerCase())
    }
    expect(css).toMatch(/--brand-royal:\s*#2296f3/i)
    expect(css).toMatch(/--brand-yellow:\s*#fbbe0a/i)
    expect(css).toMatch(/--brand-navy:\s*#0f2341/i)
    expect(css).toMatch(/--brand-warning:\s*#f7801e/i)
    expect(css).toMatch(/--brand-neutral:\s*#6e7d95/i)
  })

  it('desactiva la paleta por defecto de Tailwind', () => {
    expect(css).toMatch(/--color-\*:\s*initial;/)
  })

  it('ningún archivo de interfaz contiene colores retirados', () => {
    const hits: string[] = []
    for (const file of [...sourceFiles(), join(ROOT, 'public', 'favicon.svg')]) {
      const text = read(file)
      for (const hex of RETIRED) {
        if (text.toUpperCase().includes(hex)) hits.push(`${relative(ROOT, file)}: ${hex}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('los hexadecimales de componentes pertenecen a la paleta oficial o a blanco y negro', () => {
    const allowed = new Set([...Object.values(BRAND), '#FFFFFF', '#000000'].map((h) => h.toUpperCase()))
    const hits: string[] = []
    for (const file of sourceFiles().filter((f) => !f.endsWith('globals.css'))) {
      for (const match of read(file).matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (!allowed.has(match[0].toUpperCase())) hits.push(`${relative(ROOT, file)}: ${match[0]}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('no usa clases de la paleta por defecto de Tailwind', () => {
    const hits: string[] = []
    for (const file of sourceFiles()) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          for (const match of line.matchAll(new RegExp(DEFAULT_PALETTE.source, 'g'))) {
            // Los tonos de azul royal definidos en globals.css son tokens de marca, no paleta por defecto.
            if (!BRAND_BLUE_TOKENS.test(match[0])) hits.push(`${relative(ROOT, file)}:${i + 1}: ${match[0]}`)
          }
        })
    }
    expect(hits).toEqual([])
  })
})

describe('logotipo e isotipo', () => {
  it('el componente de logotipo no dibuja formas propias', () => {
    const text = read(join(SRC, 'components', 'brand', 'logo.tsx'))
    expect(text).not.toMatch(/<path|<rect|<circle|<polygon|<svg/)
    expect(text).toContain('/brand/logixtic-isotipo.svg')
  })

  it('el favicon no contiene la X antigua', () => {
    const svg = read(join(ROOT, 'public', 'favicon.svg'))
    expect(svg).not.toMatch(/<path|<circle|linearGradient/)
  })
})

describe('contraste WCAG AA de los pares de texto', () => {
  // Texto normal: 4.5:1 como mínimo.
  it('azul noche sobre blanco', () => {
    expect(contrast(BRAND.navy, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })
  it('texto secundario (azul noche al 68 %) sobre blanco', () => {
    expect(contrast(mixOverWhite(BRAND.navy, 0.68), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })
  it('blanco sobre azul noche (botón principal y panel de acceso)', () => {
    expect(contrast('#FFFFFF', BRAND.navy)).toBeGreaterThanOrEqual(4.5)
  })
  it('azul noche sobre azul royal (acciones sobre acento)', () => {
    expect(contrast(BRAND.navy, BRAND.royal)).toBeGreaterThanOrEqual(4.5)
  })
  it('azul royal sobre azul noche (acento sobre superficie institucional)', () => {
    expect(contrast(BRAND.royal, BRAND.navy)).toBeGreaterThanOrEqual(4.5)
  })
  it('azul noche sobre amarillo (texto permitido sobre el acento)', () => {
    expect(contrast(BRAND.navy, BRAND.yellow)).toBeGreaterThanOrEqual(4.5)
  })
  // Blanco sobre royal y naranja no cumplen texto normal: la regla es no usarlos para texto pequeño.
  it('blanco sobre azul royal queda por debajo de 4.5:1 y no se usa para texto normal', () => {
    expect(contrast('#FFFFFF', BRAND.royal)).toBeLessThan(4.5)
  })
  it('naranja sobre blanco queda por debajo de 4.5:1: las alertas llevan icono y texto azul noche', () => {
    expect(contrast(BRAND.warning, '#FFFFFF')).toBeLessThan(4.5)
  })
})
