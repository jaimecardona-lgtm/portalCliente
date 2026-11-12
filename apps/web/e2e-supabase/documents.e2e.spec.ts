/**
 * E2E contra Supabase REAL. Se omite salvo que se configure explícitamente.
 *
 * No crea usuarios ni empresas. Requiere una cuenta de cliente administrador ya invitada por el responsable,
 * con un cliente final asignado, y dos archivos autorizados (PDF) para subir y reemplazar.
 * Variables (solo en el entorno local del responsable, nunca en el repositorio):
 *   E2E_SUPABASE=1
 *   E2E_EMAIL, E2E_PASSWORD           credenciales de la cuenta autorizada
 *   E2E_PDF_PATH, E2E_PDF_REPLACEMENT_PATH   rutas a los archivos autorizados
 * Ver docs/e2e-supabase-documentos.md.
 */
import { test, expect } from '@playwright/test'
import { basename } from 'node:path'

const enabled = process.env.E2E_SUPABASE === '1'
const email = process.env.E2E_EMAIL ?? ''
const password = process.env.E2E_PASSWORD ?? ''
const pdfPath = process.env.E2E_PDF_PATH ?? ''
const replacementPath = process.env.E2E_PDF_REPLACEMENT_PATH ?? ''

test.describe('documentos contra Supabase real', () => {
  test.skip(!enabled || !email || !password || !pdfPath || !replacementPath, 'Configuración E2E de Supabase ausente.')

  test('inicia sesión, sube, abre, reemplaza y retira un documento', async ({ page, context }) => {
    const fileName = basename(pdfPath)

    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })

    await page.goto('/documentos')
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible({ timeout: 30_000 })

    await page.locator('input[aria-label="Seleccionar documento para subir"]').setInputFiles(pdfPath)
    await expect(page.getByRole('cell', { name: fileName })).toBeVisible({ timeout: 60_000 })

    const popupPromise = context.waitForEvent('page')
    await page.getByRole('row', { name: new RegExp(fileName) }).getByRole('button', { name: 'Abrir' }).click()
    const popup = await popupPromise
    expect(popup.url()).toContain('token=')
    await popup.close()

    await page.locator(`input[aria-label="Seleccionar nueva versión de ${fileName}"]`).setInputFiles(replacementPath)
    await expect(page.getByText(/Nueva versión publicada/)).toBeVisible({ timeout: 60_000 })

    const row = page.getByRole('row', { name: new RegExp(basename(replacementPath)) })
    await row.getByRole('button', { name: 'Retirar' }).click()
    await row.getByRole('button', { name: 'Sí, retirar' }).click()
    await expect(page.getByText(/Documento retirado/)).toBeVisible({ timeout: 60_000 })
  })
})
