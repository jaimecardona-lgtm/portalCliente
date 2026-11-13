/**
 * Garantías estáticas del panel de soporte: sin datos de ejemplo, sin almacenamiento del navegador para el contexto,
 * sin contexto en la URL y sin secretos. Lee el código fuente; no renderiza nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')
// Solo el código: los comentarios describen lo que NO se hace y pueden nombrar las APIs prohibidas.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('panel de soporte del personal', () => {
  const page = read('features', 'support', 'staff-panel-page.tsx')
  const api = read('services', 'api', 'staff-api.ts')

  it('no importa datos de ejemplo ni repositorios mock', () => {
    expect(page + api).not.toMatch(/mock|fixtures|useRepository|loadLocalRepository|local-auth/i)
  })

  it('no guarda el contexto de trabajo en almacenamiento del navegador ni en la URL', () => {
    expect(code(page) + code(api)).not.toMatch(/localStorage|sessionStorage|indexedDB|useSearch|window\.location\.search/)
  })

  it('no contiene claves privilegiadas', () => {
    expect(page + api).not.toMatch(/sb_secret_|service_role|SUPABASE_SECRET|OPENROUTER|sk-or-/)
  })

  it('las empresas se muestran solo desde la lista del servidor (ya verificada y asignada)', () => {
    expect(page).toMatch(/tenants\.data\.map/)
    expect(page).not.toMatch(/listTenants|allTenants|tenants\.json/)
  })
})
