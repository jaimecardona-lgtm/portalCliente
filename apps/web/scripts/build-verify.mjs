// Build de producción con una configuración de verificación y comprobación del bundle resultante.
// Valores SINTÉTICOS: el proyecto de Supabase no es real y no se afirma ninguna conexión. Con proveedor
// "supabase" y pantallas no conectadas, la aplicación generada bloquea el acceso. Su único propósito es
// comprobar que la compilación de producción acepta una configuración pública válida y que el bundle está limpio.
import { spawnSync } from 'node:child_process'

const env = {
  ...process.env,
  VITE_AUTH_PROVIDER: 'supabase',
  VITE_API_BASE_URL: '/api/v1',
  VITE_SUPABASE_URL: 'https://proyecto-verificacion.supabase.test',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_verificacion_sintetica_000000',
}

const build = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env, shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

const verify = spawnSync(process.execPath, ['scripts/verify-bundle.mjs'], { stdio: 'inherit' })
process.exit(verify.status ?? 1)
