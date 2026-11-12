import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Control de texto visible: la interfaz destinada a clientes no debe mostrar términos de prototipo
 * o de demostración. Se revisan los módulos de interfaz; se ignoran comentarios, importaciones,
 * fixtures, servicios de datos y pruebas, que sí pueden usar esos términos internamente.
 */
// Vitest se ejecuta desde apps/web (ver `npm test`).
const SRC = join(process.cwd(), 'src')
const UI_DIRS = ['app', 'features', 'layouts', 'components', 'routes']
const FORBIDDEN = /\b(demo|prototipo|simulaci\w*|datos de prueba|sintétic\w*|sandbox|mock)\b/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

function visibleLines(file: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = []
  let inBlockComment = false
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, index) => {
      const t = raw.trim()
      if (inBlockComment) {
        if (t.includes('*/')) inBlockComment = false
        return
      }
      if (t.startsWith('/*') || t.startsWith('/**')) {
        if (!t.includes('*/')) inBlockComment = true
        return
      }
      if (t.startsWith('//') || t.startsWith('import ') || t.startsWith('*')) return
      // Ignora comentarios de línea al final de una línea de código.
      const code = raw.replace(/\s\/\/.*$/, '')
      out.push({ line: index + 1, text: code })
    })
  return out
}

describe('texto visible sin términos de demostración', () => {
  const files = UI_DIRS.flatMap((d) => walk(join(SRC, d)))

  it('encuentra archivos de interfaz para revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('ninguna línea de interfaz contiene términos de prototipo o demostración', () => {
    const hits: string[] = []
    for (const file of files) {
      for (const { line, text } of visibleLines(file)) {
        if (FORBIDDEN.test(text)) hits.push(`${relative(SRC, file)}:${line}: ${text.trim().slice(0, 140)}`)
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })
})
