import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas E2E del portal (datos DEMO sintéticos, sin credenciales reales).
 * - Levanta el servidor de desarrollo automáticamente (o reutiliza uno ya abierto).
 * - Dos proyectos: escritorio 1440×900 y móvil 390×844.
 * - PW_CHANNEL=chrome usa Google Chrome instalado en el equipo; sin variable usa el Chromium de Playwright
 *   (instalable con `npx playwright install chromium`).
 */
const PORT = 5173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // En dev, el primer acceso a cada chunk perezoso compila el módulo: damos margen a las aserciones.
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
