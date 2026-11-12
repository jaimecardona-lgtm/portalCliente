/**
 * Garantías estáticas de la pantalla real de documentos: no importa datos de ejemplo, no tiene respaldo a
 * repositorios mock y no contiene secretos. Lee el código fuente; no renderiza nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')

describe('pantalla real de documentos', () => {
  const page = read('features', 'documents', 'client-documents-page.tsx')
  const api = read('services', 'api', 'documents-api.ts')

  it('no importa repositorios mock, fixtures ni el repositorio local', () => {
    for (const source of [page, api]) {
      expect(source).not.toMatch(/mock|fixtures|useRepository|loadLocalRepository|local-auth/i)
    }
  })

  it('no contiene claves privilegiadas ni nombres de secretos', () => {
    for (const source of [page, api]) {
      expect(source).not.toMatch(/sb_secret_|service_role|SUPABASE_SECRET|OPENROUTER|sk-or-/)
    }
  })

  it('no guarda URLs firmadas en almacenamiento del navegador ni en estado persistente', () => {
    expect(page).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    expect(api).not.toMatch(/localStorage|sessionStorage|indexedDB/)
  })

  it('la ruta usa la pantalla real solo en modo Supabase y la anterior en modo local', () => {
    const router = read('routes', 'router.tsx')
    expect(router).toMatch(/SUPABASE_ACCESS_ENABLED\s*\?\s*<ClientDocumentsPage\s*\/>\s*:\s*<DocumentsPage\s*\/>/)
  })

  it('los controles de escritura dependen del rol devuelto por el servidor', () => {
    expect(page).toMatch(/active\.canManage/)
    expect(page).not.toMatch(/role\s*===\s*['"]client_admin['"]\s*\)\s*\{?\s*$/m)
  })
})
