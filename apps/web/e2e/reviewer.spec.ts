import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Validación del usuario local de revisión (solo localhost, solo desarrollo).
 * - El correo y el nombre se leen de apps/web/local/reviewer.config.json (ignorado por Git).
 * - La contraseña NO está en el repositorio: se pasa por la variable REVIEWER_E2E_PASSWORD al ejecutar.
 * Si falta alguno de los dos, la suite se omite.
 */
const CONFIG = join(process.cwd(), 'local', 'reviewer.config.json')
const PASSWORD = process.env.REVIEWER_E2E_PASSWORD ?? ''
const config = existsSync(CONFIG) ? (JSON.parse(readFileSync(CONFIG, 'utf8')) as { user: { email: string; fullName: string } }) : null

test.skip(!config || !PASSWORD, 'Requiere `npm run setup:local-user` y REVIEWER_E2E_PASSWORD (la contraseña no se guarda en el repositorio).')

const EMAIL = config?.user.email ?? ''
const FULL_NAME = config?.user.fullName ?? ''

async function login(page: Page, password = PASSWORD) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function openProfile(page: Page) {
  await page.locator('button[aria-haspopup="menu"]').click()
  return page.getByRole('menu')
}

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill('contraseña-incorrecta-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña no válidos.')
  await expect(page).toHaveURL(/\/login/)
})

test('inicia sesión y muestra el perfil y la empresa asignada', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
  const menu = await openProfile(page)
  await expect(menu).toContainText(FULL_NAME)
  await expect(menu).toContainText(EMAIL)
  await expect(menu).toContainText('Textiles Andinos')
  await page.keyboard.press('Escape')
})

test('navega por las pantallas autorizadas', async ({ page }) => {
  await login(page)
  await page.goto('/operaciones')
  await expect(page.getByText(/de 6 operaciones/)).toBeVisible()
  await page.goto('/operaciones/op-0412')
  await expect(page.getByRole('heading', { name: 'DO-26-0412' })).toBeVisible()
  await page.goto('/documentos')
  await expect(page.getByRole('heading', { name: 'Gestión documental' })).toBeVisible()
  await page.goto('/cotizaciones')
  await expect(page.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible()
  await page.goto('/cotizaciones/qt-1003')
  await expect(page.getByRole('heading', { name: 'Carga aérea Bogotá → Miami' })).toBeVisible()
  await page.goto('/solicitudes')
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible()
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { name: 'Información de cuenta' })).toBeVisible()
})

test('publica un comentario en un evento de la operación', async ({ page }) => {
  await login(page)
  await page.goto('/operaciones/op-0398')
  const textarea = page.getByRole('textbox', { name: 'Escribir mensaje para este evento' }).first()
  const message = 'Revisión QA: comentario de prueba del usuario local.'
  await textarea.fill(message)
  await page.getByRole('button', { name: 'Publicar', exact: true }).first().click()
  await expect(page.getByRole('region', { name: /Conversación · Acción requerida/ }).first()).toContainText(message)
})

test('no muestra operaciones ni cotizaciones de otra empresa aunque se conozca su URL', async ({ page }) => {
  await login(page)
  await page.goto('/operaciones/op-0408')
  await expect(page.getByText('Operación no encontrada')).toBeVisible()
  await page.goto('/cotizaciones/qt-2001')
  await expect(page.getByText('Cotización no encontrada')).toBeVisible()
})

test('crea una solicitud local', async ({ page }) => {
  await login(page)
  await page.goto('/solicitudes/nueva')
  await page.getByLabel('Asunto *').fill('Consulta de revisión QA')
  await page.getByLabel('Descripción *').fill('Solicitud de prueba creada desde la validación del usuario local.')
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible()
  await expect(page.getByText('Consulta de revisión QA')).toBeVisible()
})

test('el asistente Logix responde con datos de la empresa asignada', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Abrir asistente Logix' }).click()
  await page.getByLabel('Escriba su pregunta para Logix').fill('¿Cuántas operaciones activas tengo?')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Tiene 4 operaciones activas/)).toBeVisible()
})

test('cierra sesión y bloquea las rutas protegidas', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
  const menu = await openProfile(page)
  const logout = menu.getByRole('menuitem', { name: 'Cerrar sesión' })
  await expect(logout).toBeVisible()
  await page.waitForTimeout(300) // espera a que termine la animación de apertura del menú
  await logout.click({ force: true })
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/operaciones')
  await expect(page).toHaveURL(/\/login/)
  const stored = await page.evaluate(() => window.sessionStorage.getItem('logixtic.portal.session'))
  expect(stored).toBeNull()
})
