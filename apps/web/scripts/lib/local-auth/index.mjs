// Composición del acceso local de desarrollo: almacén JSON + servicio + middleware.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createStore } from './store.mjs'
import { createLocalAuthMiddleware } from './http.mjs'
import { readReviewerConfig } from '../reviewer-credentials.mjs'

/** Tenant sintético asignado a las cuentas creadas en desarrollo. Lo decide el servidor. */
export const LOCAL_TENANT_ID = 'tn-andino'

export function createLocalAuth({ rootDir, clock = () => Date.now() }) {
  const dir = join(rootDir, 'local', 'auth')
  const legalMeta = JSON.parse(readFileSync(join(rootDir, 'src', 'content', 'legal', 'legal-meta.json'), 'utf8'))
  const legacyPath = join(rootDir, 'local', 'reviewer.config.json')
  const store = createStore({
    dir,
    legacyReviewerConfigPath: legacyPath,
    tenantId: LOCAL_TENANT_ID,
    clock,
  })
  const ready = store.init(existsSync(legacyPath) ? (p) => readReviewerConfig(p) : null).catch(() => {})
  const middleware = createLocalAuthMiddleware({ store, tenantId: LOCAL_TENANT_ID, legalVersion: legalMeta.version, clock })
  return {
    store,
    legalVersion: legalMeta.version,
    /** Espera a la migración inicial antes de atender peticiones. */
    middleware: (req, res) => {
      ready.then(() => middleware(req, res))
    },
  }
}
