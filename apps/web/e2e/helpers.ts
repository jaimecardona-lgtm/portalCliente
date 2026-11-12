import { expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Contraseña de las cuentas de prueba creadas por cada ejecución. No es una credencial real. */
export const TEST_PASSWORD = 'clave-e2e-prueba-2026'

/** Correo único y sintético (dominio reservado .example). */
export function uniqueEmail(prefix = 'qa'): string {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}@pruebas.example`
}

function currentLegalVersion(): string {
  const meta = JSON.parse(readFileSync(join(process.cwd(), 'src', 'content', 'legal', 'legal-meta.json'), 'utf8')) as { version: string }
  return meta.version
}

/**
 * Crea una cuenta mediante el servidor local de desarrollo. La cookie de sesión queda en el contexto
 * del navegador, así que la siguiente carga de la aplicación ya estará autenticada.
 */
export async function createAccount(page: Page, options: { email?: string; password?: string; fullName?: string } = {}) {
  const email = options.email ?? uniqueEmail()
  const password = options.password ?? TEST_PASSWORD
  const response = await page.request.post('/__local-auth/register', {
    data: {
      fullName: options.fullName ?? 'Cliente de Prueba',
      email,
      password,
      acceptTerms: true,
      termsVersion: currentLegalVersion(),
    },
  })
  expect(response.status(), 'la cuenta de prueba debe crearse').toBe(201)
  return { email, password }
}

/** Crea una cuenta y abre el portal ya autenticado (sin pasar por la pantalla de login). */
export async function loginAs(page: Page) {
  const account = await createAccount(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
  return account
}

/** Verifica que la página no tiene desbordamiento horizontal (criterio de responsive). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'scrollWidth no debe superar el viewport').toBeLessThanOrEqual(1)
}
