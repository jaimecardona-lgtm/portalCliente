import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Política de datos reales (CLAUDE.md): los datos ficticios no pueden llegar a presentación, staging ni
 * producción. Estas pruebas fallan si una importación estática vuelve a traer fixtures, el repositorio mock
 * o el motor de respuestas de Logix al código de la aplicación.
 */
const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** Importaciones estáticas (no dinámicas) de un archivo. */
function staticImports(text: string): string[] {
  return [...text.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')
}

const files = walk(SRC)
const rel = (f: string) => relative(SRC, f).replaceAll('\\', '/')

describe('política de datos reales: importaciones estáticas', () => {
  it('los fixtures solo los importa el repositorio mock', () => {
    const offenders = files
      .filter((f) => rel(f) !== 'services/repositories/mock-repository.ts')
      .filter((f) => staticImports(readFileSync(f, 'utf8')).some((spec) => spec.includes('data/fixtures')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('el repositorio mock solo se carga de forma dinámica desde el punto de entrada de desarrollo', () => {
    const offenders = files
      .filter((f) => rel(f) !== 'services/repositories/index.ts')
      .filter((f) => staticImports(readFileSync(f, 'utf8')).some((spec) => spec.includes('mock-repository')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('el motor de reglas predefinidas de Logix (logix-assistant) no se importa en ningún módulo', () => {
    const offenders = files
      .filter((f) => staticImports(readFileSync(f, 'utf8')).some((spec) => spec.includes('logix-assistant')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('el widget Logix real no contiene respuestas predefinidas: consulta al backend', () => {
    const widget = readFileSync(join(SRC, 'features', 'assistant', 'logix', 'logix-widget.tsx'), 'utf8')
    expect(widget).not.toMatch(/logix-assistant|predefin/i)
    expect(widget).toMatch(/api\.ask\(/)
  })

  it('la shell monta el widget real y no carga el motor de reglas', () => {
    const shell = readFileSync(join(SRC, 'layouts', 'app-shell.tsx'), 'utf8')
    expect(shell).not.toMatch(/logix-assistant/)
    expect(shell).toMatch(/features\/assistant\/logix\/logix-widget/)
  })
})

describe('política de datos reales: sin datos de prueba en el código de aplicación', () => {
  it('ningún archivo de aplicación contiene la credencial de demostración', () => {
    // Patrón genérico: ninguna contraseña de demostración con formato "Demo-AAAA" en el código de aplicación.
    const offenders = files
      .filter((f) => /Demo-\d{4}/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
