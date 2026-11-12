/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createLocalAuth } from './scripts/lib/local-auth/index.mjs'
import { isAllowedProductionApiUrl } from './scripts/lib/production-api-url.mjs'
import { readSupabaseConfig, type SupabaseEnv } from './src/services/auth/supabase-config'

/** Proveedores de identidad permitidos en producción (debe coincidir con src/config/runtime.ts). */
const ALLOWED_PRODUCTION_PROVIDERS = ['supabase']


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
      if (!isAllowedProductionApiUrl(apiUrl)) {
        this.error(
          'Build de producción bloqueado: VITE_API_BASE_URL debe ser una URL https absoluta o una ruta relativa del mismo origen (p. ej. /api/v1).',
        )
      }
      // Supabase exige configuración pública válida. La clave que llega al bundle se valida para que no sea
      // una clave con privilegios de servicio. Sin configuración, el build no se genera.
      let supabaseProblem: string | null = null
      try {
        if (readSupabaseConfig(env as SupabaseEnv) === null) {
          supabaseProblem = 'requiere VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.'
        }
      } catch (error) {
        supabaseProblem = error instanceof Error ? error.message : 'configuración de Supabase no válida.'
      }
      if (supabaseProblem) this.error(`Build de producción bloqueado: Supabase ${supabaseProblem}`)
    },
  }
}


/**
 * Registra el acceso de revisión solo en el servidor de desarrollo (vite dev).
 * configureServer no existe en el build ni en la vista previa: el middleware nunca llega a producción.
 */
function localReviewerAuth(): Plugin {
  return {
    name: 'logixtic-local-reviewer-auth',
    apply: 'serve',
    configureServer(server) {
      if (server.config.mode === 'production') return
      const auth = createLocalAuth({ rootDir: fileURLToPath(new URL('.', import.meta.url)) })
      server.middlewares.use('/__local-auth', auth.middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), productionAccessGuard(mode, env), localReviewerAuth()],
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
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    },
  }
})
