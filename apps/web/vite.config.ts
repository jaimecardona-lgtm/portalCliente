/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Proveedores de identidad permitidos en producción (debe coincidir con src/config/runtime.ts). */
const ALLOWED_PRODUCTION_PROVIDERS = ['oidc']

/**
 * Impide generar un build de producción sin un proveedor de identidad y una API configurados.
 * El build de producción nunca debe quedar disponible con fixtures ni con autenticación simulada.
 */
function productionAccessGuard(mode: string, env: Record<string, string>): Plugin {
  return {
    name: 'logixtic-production-access-guard',
    apply: 'build',
    buildStart() {
      if (mode !== 'production') return
      const provider = (env.VITE_AUTH_PROVIDER ?? '').trim()
      const apiUrl = (env.VITE_API_BASE_URL ?? '').trim()
      if (!provider) {
        this.error('Build de producción bloqueado: falta VITE_AUTH_PROVIDER (proveedor de identidad real).')
      }
      if (!ALLOWED_PRODUCTION_PROVIDERS.includes(provider)) {
        this.error(`Build de producción bloqueado: VITE_AUTH_PROVIDER="${provider}" no es un proveedor permitido.`)
      }
      if (!/^https:\/\//.test(apiUrl)) {
        this.error('Build de producción bloqueado: VITE_API_BASE_URL debe ser una URL https.')
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), productionAccessGuard(mode, env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
