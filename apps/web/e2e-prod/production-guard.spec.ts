import { test, expect, type Page } from '@playwright/test'

/** Credenciales de presentación: en producción NO deben funcionar. */
const LOCAL_EMAIL = 'ana.torres@textilesandinos.example'
const LOCAL_PASSWORD = 'Demo-2026'
const FORBIDDEN_TEXT = [/demo/i, /Textiles Andinos/, /Agroexport/, /Cuentas de demostración/, /Rellenar/, /Entorno local/, /sintétic/i, /Modo DEMO/i]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test('la raíz redirige a login sin sesión', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('las rutas protegidas redirigen a login y no muestran contenido', async ({ page }) => {
  for (const path of ['/operaciones', '/operaciones/op-0412', '/documentos', '/cotizaciones', '/solicitudes/nueva', '/cuenta', '/marketplace']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bienvenido a Logixtic' })).toBeVisible()
  }
})

test('el login no muestra cuentas, contraseñas ni textos de demostración', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Bienvenido a Logixtic' })).toBeVisible()
  const body = await page.locator('body').innerText()
  for (const pattern of FORBIDDEN_TEXT) {
    expect(body, `texto prohibido: ${pattern}`).not.toMatch(pattern)
  }
  await expect(page.locator('input[value="Demo-2026"]')).toHaveCount(0)
})

test('el acceso con credenciales sintéticas no funciona en producción', async ({ page }) => {
  await page.goto('/login')
  const submit = page.getByRole('button', { name: 'Iniciar sesión' })
  await expect(submit).toBeDisabled()
  await expect(page.locator('#email')).toBeDisabled()
  // Aunque se intente forzar el envío, no se crea sesión.
  await page.evaluate(([email, password]) => {
    const e = document.getElementById('email') as HTMLInputElement | null
    const p = document.getElementById('password') as HTMLInputElement | null
    if (e) e.value = email
    if (p) p.value = password
  }, [LOCAL_EMAIL, LOCAL_PASSWORD])
  await submit.click({ force: true }).catch(() => undefined)
  const stored = await page.evaluate(() => window.sessionStorage.getItem('logixtic.portal.session'))
  expect(stored).toBeNull()
  await expect(page).toHaveURL(/\/login/)
})

test('el asistente Logix no aparece activo fuera de la sesión', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Bienvenido a Logixtic' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir asistente Logix' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Asistente Logix' })).toHaveCount(0)
})

test('sin errores de consola en el login', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

test('el login se adapta sin desbordamiento horizontal', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
