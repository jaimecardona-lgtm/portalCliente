/**
 * Configuración de entorno y funciones disponibles.
 *
 * Dos modos de acceso, separados a propósito:
 * - Presentación local ("local"): solo existe en desarrollo (`vite dev`). Usa cuentas JSON locales
 *   y datos sintéticos. Nunca llega al bundle de producción.
 * - Supabase Auth ("supabase"): único proveedor real. Exige configuración pública válida
 *   (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY) y una implementación de pantallas registrada en
 *   IMPLEMENTED_AUTH_PROVIDERS. Hasta entonces, la aplicación queda BLOQUEADA en producción.
 *
 * Reglas:
 * - Ninguna sesión JSON ni simulada concede acceso fuera de desarrollo.
 * - Sin proveedor implementado no hay acceso, aunque la configuración esté completa.
 * - `import.meta.env.DEV` se sustituye por una constante en el build, así el código local y sus
 *   fixtures se eliminan del bundle de producción.
 */
import { readSupabaseConfig, type SupabaseEnv } from '@/services/auth/supabase-config'

export const IS_LOCAL_PRESENTATION: boolean = import.meta.env.DEV

/** Proveedores de identidad reconocidos. Único valor real: Supabase Auth. */
export const KNOWN_AUTH_PROVIDERS: readonly string[] = ['supabase']

/**
 * Proveedores con pantallas de inicio de sesión conectadas al proveedor. VACÍO: el login, la recuperación y
 * la guarda de rutas todavía usan el modo local. Añadir 'supabase' solo cuando las pantallas estén conectadas
 * y verificadas (ver docs/supabase-preparation.md, sección 7b).
 */
export const IMPLEMENTED_AUTH_PROVIDERS: readonly string[] = []

export type BlockReason =
  | 'provider-missing'
  | 'provider-unknown'
  | 'api-url-missing'
  | 'supabase-config-missing'
  | 'provider-not-implemented'

export type AccessState = { mode: 'local' } | { mode: 'blocked'; reason: BlockReason }

export interface AccessInput {
  isLocal: boolean
  provider?: string
  apiBaseUrl?: string
  /** true solo si la configuración pública de Supabase es válida (ver supabase-config.ts). */
  supabaseConfigured?: boolean
}

/** Decide si la aplicación puede dar acceso. Función pura para poder probarla. */
export function resolveAccessState(input: AccessInput): AccessState {
  if (input.isLocal) return { mode: 'local' }
  const provider = (input.provider ?? '').trim()
  if (!provider) return { mode: 'blocked', reason: 'provider-missing' }
  if (!KNOWN_AUTH_PROVIDERS.includes(provider)) return { mode: 'blocked', reason: 'provider-unknown' }
  if (!(input.apiBaseUrl ?? '').trim()) return { mode: 'blocked', reason: 'api-url-missing' }
  if (provider === 'supabase' && !input.supabaseConfigured) {
    return { mode: 'blocked', reason: 'supabase-config-missing' }
  }
  // Configuración válida pero sin pantallas conectadas al proveedor: sigue bloqueado.
  return { mode: 'blocked', reason: 'provider-not-implemented' }
}

/** true si la configuración pública de Supabase es válida. Nunca lanza: una configuración insegura cuenta como no configurada. */
export function isSupabaseConfigured(env: SupabaseEnv): boolean {
  try {
    return readSupabaseConfig(env) !== null
  } catch {
    return false
  }
}

export const ACCESS_STATE: AccessState = resolveAccessState({
  isLocal: IS_LOCAL_PRESENTATION,
  provider: import.meta.env.VITE_AUTH_PROVIDER,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  supabaseConfigured: isSupabaseConfigured({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }),
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
