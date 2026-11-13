/**
 * Garantía estática: el aviso de vistas de empresa para personal interno no consulta datos ni usa ejemplos.
 * Lee el código fuente; no renderiza nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const code = readFileSync(join(process.cwd(), 'src', 'features', 'support', 'staff-module-notice.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('aviso de vistas de empresa para personal interno', () => {
  it('no consulta repositorios, API ni datos de ejemplo', () => {
    expect(code).not.toMatch(/useRepository|useQuery|fetch\(|portal\.|mock|fixtures/i)
  })
})
