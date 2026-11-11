/**
 * Configuración de entorno y funciones disponibles.
 *
 * Dos entornos explícitos:
 * - Presentación local ("local"): solo existe en desarrollo (`vite dev`). Usa datos sintéticos
 *   y un acceso local con cuentas de prueba. Nunca llega al bundle de producción.
 * - Producción ("blocked" hasta que exista backend): exige un proveedor de identidad real.
 *   No acepta credenciales sintéticas, no usa sesiones simuladas y no ofrece cambio de empresa.
 *
 * `import.meta.env.DEV` se sustituye por una constante en el build, por lo que el código
 * de la rama local (y sus fixtures) se elimina del bundle de producción.
 */

export const IS_LOCAL_PRESENTATION: boolean = import.meta.env.DEV

/** Proveedores de identidad reconocidos. Ninguno está implementado todavía. */
export const KNOWN_AUTH_PROVIDERS: readonly string[] = ['oidc']
/** Proveedores con implementación real en el frontend. Vacío hasta integrar el backend. */
export const IMPLEMENTED_AUTH_PROVIDERS: readonly string[] = []

export type BlockReason =
  | 'provider-missing'
  | 'provider-unknown'
  | 'api-url-missing'
  | 'provider-not-implemented'

export type AccessState = { mode: 'local' } | { mode: 'blocked'; reason: BlockReason }

export interface AccessInput {
  isLocal: boolean
  provider?: string
  apiBaseUrl?: string
}

/** Decide si la aplicación puede dar acceso. Función pura para poder probarla. */
export function resolveAccessState(input: AccessInput): AccessState {
  if (input.isLocal) return { mode: 'local' }
  const provider = (input.provider ?? '').trim()
  if (!provider) return { mode: 'blocked', reason: 'provider-missing' }
  if (!KNOWN_AUTH_PROVIDERS.includes(provider)) return { mode: 'blocked', reason: 'provider-unknown' }
  if (!(input.apiBaseUrl ?? '').trim()) return { mode: 'blocked', reason: 'api-url-missing' }
  if (!IMPLEMENTED_AUTH_PROVIDERS.includes(provider)) return { mode: 'blocked', reason: 'provider-not-implemented' }
  return { mode: 'blocked', reason: 'provider-not-implemented' }
}

export const ACCESS_STATE: AccessState = resolveAccessState({
  isLocal: IS_LOCAL_PRESENTATION,
  provider: import.meta.env.VITE_AUTH_PROVIDER,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
})

export interface FeatureFlags {
  /** Selector de empresa para QA local. Solo desarrollo. */
  tenantSwitcher: boolean
  /** Asistente Logix con respuestas por reglas sobre datos locales. */
  assistant: boolean
  /** Decisión de aceptar o rechazar cotizaciones. */
  quoteDecisions: boolean
  /** Envío de solicitudes. */
  requestSubmission: boolean
  /** Carga de nuevas versiones documentales. */
  documentUpload: boolean
  /** Vista previa de archivos documentales. */
  documentPreview: boolean
  /** Marketplace (funcionalidad futura). */
  marketplace: boolean
  /** Recuperación de contraseña. */
  passwordRecovery: boolean
}

/** Funciones disponibles por entorno. En producción todas quedan desactivadas hasta tener backend. */
export function buildFeatures(isLocal: boolean): FeatureFlags {
  return {
    tenantSwitcher: isLocal,
    assistant: isLocal,
    quoteDecisions: isLocal,
    requestSubmission: isLocal,
    documentUpload: isLocal,
    documentPreview: isLocal,
    marketplace: isLocal,
    passwordRecovery: false,
  }
}

export const FEATURES: FeatureFlags = buildFeatures(IS_LOCAL_PRESENTATION)

/** true solo cuando la sesión local puede utilizarse (desarrollo). */
export const LOCAL_ACCESS_ENABLED = ACCESS_STATE.mode === 'local'
