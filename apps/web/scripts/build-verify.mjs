// Build de producción con una configuración de verificación y comprobación del bundle resultante.
// La configuración usa valores de prueba: el proveedor "oidc" aún no está implementado, así que la
// aplicación generada bloquea el acceso. Su único propósito es comprobar la compilación y el bundle.
import { spawnSync } from 'node:child_process'

const env = {
  ...process.env,
  VITE_AUTH_PROVIDER: 'oidc',
  VITE_API_BASE_URL: 'https://api-verificacion.invalid',
}

const build = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env, shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

const verify = spawnSync(process.execPath, ['scripts/verify-bundle.mjs'], { stdio: 'inherit' })
process.exit(verify.status ?? 1)
