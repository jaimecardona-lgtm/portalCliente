import { test, expect } from '@playwright/test'
import { ANDINO_EMAIL, DEMO_PASSWORD, expectNoHorizontalOverflow, loginAs } from './helpers'

test.describe('acceso', () => {
  test('rechaza una contraseña incorrecta y acepta la de demostración', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(ANDINO_EMAIL)
    await page.locator('#password').fill('otra-clave')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña no válidos.')

    await page.locator('#password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('redirige a login si no hay sesión', async ({ page }) => {
    await page.goto('/operaciones')
    await expect(page).toHaveURL(/\/login/)
  })

  test('el login no muestra cuentas, contraseñas ni textos de demostración', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1, name: 'Bienvenido a Logixtic' })).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/Demo-2026|textilesandinos.example|agroexport-pacifico.example|Cuentas de demostración|Rellenar|Modo DEMO|Textiles Andinos/)
    await expect(page.locator('input[value="Demo-2026"]')).toHaveCount(0)
  })

  test('valida campos vacíos sin enviar', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('Ingresa tu correo corporativo.')).toBeVisible()
  })
})

test.describe('torre de control', () => {
  test('muestra indicadores y no desborda la página', async ({ page }) => {
    await loginAs(page)
    await expect(page.getByText('Operaciones activas')).toBeVisible()
    await expect(page.getByText('Documentos vencidos')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('el enlace "Saltar al contenido" recibe foco con teclado', async ({ page }) => {
    await loginAs(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
  })
})

test.describe('operaciones', () => {
  test('los filtros afectan los resultados y se conservan en la URL', async ({ page }) => {
    await loginAs(page)
    await page.goto('/operaciones')
    await expect(page.getByText(/de 6 operaciones/)).toBeVisible()
    const filtersToggle = page.getByRole('button', { name: /^Filtros/ })
    if (await filtersToggle.isVisible()) await filtersToggle.click()

    await page.getByRole('button', { name: 'En aduana', exact: true }).click()
    await expect(page).toHaveURL(/status=En(%20|\s|\+)aduana/)
    await expect(page.getByRole('link', { name: 'DO-26-0398' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'DO-26-0412' })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('link', { name: 'DO-26-0412' })).toHaveCount(0)
  })

  test('buscar por número DO encuentra la operación exacta', async ({ page }) => {
    await loginAs(page)
    await page.goto('/operaciones?q=DO-26-0412')
    await expect(page.getByText(/1 de 6 operaciones/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'DO-26-0412' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'DO-26-0398' })).toHaveCount(0)
  })
})

test.describe('aislamiento de tenants', () => {
  test('una operación de otra empresa no se muestra aunque se conozca su URL', async ({ page }) => {
    await loginAs(page, ANDINO_EMAIL)
    await page.goto('/operaciones/op-0408') // DO de Agroexport Pacífico
    await expect(page.getByText('Operación no encontrada')).toBeVisible()
    await expect(page.getByText('DO-26-0408')).toHaveCount(0)
  })

  test('el selector de empresa del entorno local cambia los datos', async ({ page }) => {
    // El selector de simulación se muestra desde xl (1280 px); en pantallas menores es una herramienta de escritorio.
    test.skip((page.viewportSize()?.width ?? 0) < 1280, 'selector de empresa visible desde 1280 px')
    await loginAs(page, ANDINO_EMAIL)
    await page.getByRole('combobox', { name: 'Cambiar empresa (entorno local)' }).selectOption('tn-pacifico')
    await expect(page.getByText('Agroexport Pacífico').first()).toBeVisible()
    await page.goto('/operaciones/op-0408')
    await expect(page.getByRole('heading', { name: 'DO-26-0408' })).toBeVisible()
  })
})

test.describe('detalle DO y conversaciones por evento', () => {
  test('responder a un comentario conserva parentCommentId y queda en el mismo evento', async ({ page }) => {
    await loginAs(page)
    await page.goto('/operaciones/op-0398')
    // El evento "Acción requerida" está abierto por defecto y contiene el hilo cm-1 → cm-2 → cm-3.
    await expect(page.locator('[data-comment-id="cm-1"]')).toBeVisible()

    await page.locator('[data-comment-id="cm-1"] button', { hasText: 'Responder' }).first().click()
    await expect(page.getByText('Respondiendo a un mensaje de este evento')).toBeVisible()

    const message = 'Confirmo el valor FOB esta tarde.'
    await page.getByRole('textbox', { name: 'Escribir respuesta' }).fill(message)
    await page.getByRole('button', { name: 'Responder', exact: true }).last().click()

    const reply = page.locator('[data-parent-id="cm-1"]', { hasText: message })
    await expect(reply).toBeVisible()
    // La respuesta pertenece al hilo del mismo evento: sigue dentro de la misma conversación.
    await expect(page.getByRole('region', { name: /Conversación · Acción requerida/ }).first()).toContainText(message)
  })

  test('no permite publicar un mensaje de menos de 2 caracteres', async ({ page }) => {
    await loginAs(page)
    await page.goto('/operaciones/op-0398')
    const textarea = page.getByRole('textbox', { name: 'Escribir mensaje para este evento' }).first()
    await textarea.fill('x')
    await expect(page.getByRole('button', { name: 'Publicar' }).first()).toBeEnabled()
    await page.getByRole('button', { name: 'Publicar' }).first().click()
    await expect(page.getByText('Escriba al menos 2 caracteres.')).toBeVisible()
  })
})

test.describe('cotizaciones', () => {
  test('una cotización vencida no ofrece decisión', async ({ page }) => {
    await loginAs(page)
    await page.goto('/cotizaciones/qt-1002')
    await expect(page.getByText(/no admite decisiones/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0)
  })

  test('una cotización pendiente vigente se acepta con confirmación', async ({ page }) => {
    await loginAs(page)
    await page.goto('/cotizaciones/qt-1003')
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Confirmar decisión' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText('Cotización aceptada')).toBeVisible()
  })
})

test.describe('formularios y diálogos', () => {
  test('valida la nueva solicitud antes de enviar', async ({ page }) => {
    await loginAs(page)
    await page.goto('/solicitudes/nueva')
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(page.getByText('El asunto debe tener al menos 5 caracteres.')).toBeVisible()
    await expect(page.getByText('Describa la solicitud con al menos 20 caracteres.')).toBeVisible()
  })

  test('el diálogo de actualización documental se cierra con Escape y devuelve el foco', async ({ page }) => {
    await loginAs(page)
    await page.goto('/documentos')
    const trigger = page.getByRole('button', { name: 'Cargar actualización' }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAccessibleName(/Actualizar/)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})

test.describe('asistente Logix', () => {
  test('responde con datos del tenant activo', async ({ page }) => {
    await loginAs(page)
    await page.getByRole('button', { name: 'Abrir asistente Logix' }).click()
    await expect(page.getByRole('region', { name: 'Asistente Logix' }).or(page.getByLabel('Asistente Logix'))).toBeVisible()
    await page.getByLabel('Escriba su pregunta para Logix').fill('¿Cuántas operaciones activas tengo?')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Tiene 4 operaciones activas/)).toBeVisible()
  })

  test('Escape cierra el panel', async ({ page }) => {
    await loginAs(page)
    await page.getByRole('button', { name: 'Abrir asistente Logix' }).click()
    await expect(page.getByLabel('Escriba su pregunta para Logix')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Abrir asistente Logix' })).toBeVisible()
  })
})

test.describe('calidad de consola y responsive', () => {
  const routes = ['/', '/operaciones', '/operaciones/op-0412', '/documentos', '/cotizaciones', '/cotizaciones/qt-1001', '/solicitudes', '/solicitudes/nueva', '/cuenta', '/marketplace']

  for (const route of routes) {
    test(`sin scroll horizontal ni errores de consola en ${route}`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      await loginAs(page, ANDINO_EMAIL)
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalOverflow(page)
      expect(errors).toEqual([])
    })
  }
})
