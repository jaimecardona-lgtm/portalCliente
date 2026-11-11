import { expect, type Page } from '@playwright/test'

/** Contraseña pública de demostración (datos sintéticos). No es un secreto. */
export const DEMO_PASSWORD = 'Demo-2026'
export const ANDINO_EMAIL = 'ana.torres@textilesandinos.example'
export const PACIFICO_EMAIL = 'carla.nino@agroexport-pacifico.example'

/** Inicia sesión DEMO y espera la torre de control. */
export async function loginAs(page: Page, email = ANDINO_EMAIL) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
}

/** Verifica que la página no tiene desbordamiento horizontal (criterio de responsive). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'scrollWidth no debe superar el viewport').toBeLessThanOrEqual(1)
}
