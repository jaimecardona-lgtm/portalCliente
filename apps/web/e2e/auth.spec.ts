import { test, expect, type Page } from '@playwright/test'
import { createAccount, loginAs, TEST_PASSWORD, uniqueEmail } from './helpers'

/**
 * Flujos de cuenta del portal (desarrollo, servidor local JSON).
 * Cada prueba crea sus propias cuentas sintéticas; no hay contraseñas precargadas.
 */

async function fillRegistration(page: Page, opts: { name?: string; email: string; password: string; confirm?: string; accept?: boolean }) {
  await page.goto('/registro')
  await page.getByLabel('Nombre completo').fill(opts.name ?? 'Cliente de Prueba')
  await page.getByLabel('Correo electrónico').fill(opts.email)
  await page.locator('#password').fill(opts.password)
  await page.locator('#confirmPassword').fill(opts.confirm ?? opts.password)
  if (opts.accept !== false) await page.getByLabel(/He leído y acepto/).check()
}

test.describe('registro', () => {
  test('crea una cuenta desde el navegador y entra al portal', async ({ page }) => {
    const email = uniqueEmail('nuevo')
    await fillRegistration(page, { name: 'Cuenta Nueva', email, password: TEST_PASSWORD })
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
    await expect(page.getByRole('button', { name: /Cuenta Nueva|CN/ }).first()).toBeVisible()
  })

  test('exige aceptar los términos antes de crear la cuenta', async ({ page }) => {
    await fillRegistration(page, { email: uniqueEmail('sinacepta'), password: TEST_PASSWORD, accept: false })
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
    await expect(page.getByText('Debes aceptar los términos y condiciones para continuar.')).toBeVisible()
    await expect(page).toHaveURL(/\/registro/)
  })

  test('muestra la regla de contraseña y el indicador de seguridad', async ({ page }) => {
    await page.goto('/registro')
    await page.locator('#password').fill('corta')
    await expect(page.getByText(/Mínimo 8 caracteres/)).toBeVisible()
    await expect(page.getByText('Seguridad:')).toBeVisible()
    await page.locator('#password').fill('clave-suficiente-12345')
    await expect(page.getByText('La contraseña debe tener al menos 8 caracteres.')).toHaveCount(0)
  })

  test('rechaza un correo ya registrado', async ({ page }) => {
    const { email } = await createAccount(page)
    await page.context().clearCookies()
    await fillRegistration(page, { email, password: TEST_PASSWORD })
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
    await expect(page.getByText('Ya existe una cuenta con este correo.')).toBeVisible()
  })

  test('no permite elegir la empresa ni el rol', async ({ page }) => {
    await page.goto('/registro')
    await expect(page.getByLabel(/empresa/i)).toHaveCount(0)
    await expect(page.getByLabel(/rol/i)).toHaveCount(0)
  })
})

test.describe('inicio de sesión y sesión', () => {
  test('inicia sesión con la cuenta creada y mantiene la sesión al recargar', async ({ page }) => {
    const { email, password } = await createAccount(page)
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen/)
    await page.goto('/operaciones')
    await expect(page.getByText(/de 6 operaciones/)).toBeVisible()
  })

  test('cierra sesión y bloquea las rutas protegidas', async ({ page }) => {
    await loginAs(page)
    await page.locator('button[aria-haspopup="menu"]').click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/operaciones')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('perfil', () => {
  test('consulta datos, edita el nombre y muestra el cambio', async ({ page }) => {
    await loginAs(page)
    await page.goto('/perfil')
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
    await expect(page.getByText('Textiles Andinos S.A.S.').first()).toBeVisible()
    await page.getByLabel('Nombre completo').fill('Nombre Actualizado')
    await page.getByRole('button', { name: 'Guardar nombre' }).click()
    await expect(page.getByText('Nombre actualizado', { exact: true })).toBeVisible()
    await expect(page.locator('#contenido').getByText('Nombre Actualizado').first()).toBeVisible()
  })

  test('cambia la contraseña y permite entrar con la nueva', async ({ page }) => {
    const { email } = await loginAs(page)
    await page.goto('/perfil')
    const nueva = 'nueva-clave-e2e-777'
    await page.locator('#current-password').fill(TEST_PASSWORD)
    await page.locator('#new-password').fill(nueva)
    await page.locator('#confirm-password').fill(nueva)
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
    await expect(page.getByText('Contraseña actualizada')).toBeVisible()
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(nueva)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('rechaza la contraseña actual incorrecta al cambiarla', async ({ page }) => {
    await loginAs(page)
    await page.goto('/perfil')
    await page.locator('#current-password').fill('actual-incorrecta-999')
    await page.locator('#new-password').fill('nueva-clave-e2e-888')
    await page.locator('#confirm-password').fill('nueva-clave-e2e-888')
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
    await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible()
  })
})

test.describe('recuperación de contraseña', () => {
  test('genera un enlace local de un solo uso y restablece la contraseña', async ({ page }) => {
    const { email } = await createAccount(page)
    await page.context().clearCookies()

    await page.goto('/recuperar-contrasena')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
    await expect(page.getByText('Solicitud registrada')).toBeVisible()

    // Bandeja local (solo localhost): el enlace se abre desde aquí en desarrollo.
    await page.goto('/__local-auth/outbox')
    await page.locator('tr', { hasText: email }).getByRole('link', { name: 'Abrir enlace de recuperación' }).click()
    await expect(page.getByRole('heading', { name: 'Crea una nueva contraseña' })).toBeVisible()

    const nueva = 'restablecida-e2e-999'
    await page.locator('#password').fill(nueva)
    await page.locator('#confirmPassword').fill(nueva)
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
    await expect(page.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible()

    // El mismo enlace ya no sirve.
    await page.goto('/__local-auth/outbox')
    await expect(page.locator('tr', { hasText: email })).toHaveCount(0)
  })

  test('respuesta pública genérica para correos sin cuenta', async ({ page }) => {
    await page.goto('/recuperar-contrasena')
    await page.getByLabel('Correo electrónico').fill(uniqueEmail('inexistente'))
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
    await expect(page.getByText('Si el correo corresponde a una cuenta')).toBeVisible()
  })

  test('un enlace sin token o inválido muestra aviso', async ({ page }) => {
    await page.goto('/restablecer-contrasena')
    await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible()
  })
})

test.describe('textos legales', () => {
  test('términos y privacidad son consultables sin iniciar sesión', async ({ page }) => {
    await page.goto('/terminos')
    await expect(page.getByRole('heading', { level: 1, name: 'Términos y condiciones' })).toBeVisible()
    await expect(page.getByText('Pendiente de revisión jurídica')).toBeVisible()
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible()
    await expect(page.getByText(/PENDIENTE DE APROBACIÓN/).first()).toBeVisible()
  })

  test('el enlace de términos desde el registro abre el documento', async ({ page }) => {
    await page.goto('/registro')
    await page.getByRole('link', { name: 'términos y condiciones', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Términos y condiciones' })).toBeVisible()
  })
})

test.describe('aislamiento', () => {
  test('la cuenta solo ve su empresa: un DO de otra empresa no está disponible', async ({ page }) => {
    await loginAs(page)
    await page.goto('/operaciones/op-0408')
    await expect(page.getByText('Operación no encontrada')).toBeVisible()
  })
})
