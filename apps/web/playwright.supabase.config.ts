/**
 * Configuración del E2E contra Supabase real. No levanta servidor: el responsable inicia `npm run dev`
 * con VITE_AUTH_PROVIDER=supabase y la configuración pública de su proyecto (ver docs/e2e-supabase-documentos.md).
 */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: 'e2e-supabase',
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
})
