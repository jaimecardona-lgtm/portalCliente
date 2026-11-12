/**
 * Configuración de entorno y funciones disponibles.
 *
 * Dos modos de acceso, separados a propósito:
 * - Presentación local ("local"): solo existe en desarrollo (`vite dev`) y sin proveedor declarado. Usa cuentas
 *   JSON locales y datos sintéticos. Nunca llega al bundle de producción.
 * - Supabase Auth ("supabase"): único proveedor real. Exige configuración pública válida
 *   (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY), la URL de la API (VITE_API_BASE_URL) y que el proveedor
 *   figure en IMPLEMENTED_AUTH_PROVIDERS. Sin ello, la aplicación queda BLOQUEADA.
 *
 * Reglas:
 * - Ninguna sesión JSON ni simulada concede acceso fuera de desarrollo.
 * - Si VITE_AUTH_PROVIDER está declarado, manda ese proveedor también en desarrollo: nunca cae en el modo local
 *   en silencio. Así un desarrollador puede probar Supabase real sin que aparezcan datos sintéticos.
 * - Las funciones de presentación local (FEATURES) dependen del modo local, no solo de `import.meta.env.DEV`.
 * - `import.meta.env.DEV` se sustituye por una constante en el build, así el código local y sus
 *   fixtures se eliminan del bundle de producción.
 */
import { readSupabaseConfig, type SupabaseEnv } from '@/services/auth/supabase-config'

export const IS_LOCAL_PRESENTATION: boolean = import.meta.env.DEV

/** Proveedores de identidad reconocidos. Único valor real: Supabase Auth. */
export const KNOWN_AUTH_PROVIDERS: readonly string[] = ['supabase']

/**
 * Proveedores con pantallas conectadas (login, recuperación, guarda de rutas y repositorio HTTP).
 * Añadir un proveedor aquí solo cuando sus pantallas estén conectadas y verificadas.
 */
export const IMPLEMENTED_AUTH_PROVIDERS: readonly string[] = ['supabase']

export type BlockReason =
  | 'provider-missing'
  | 'provider-unknown'
  | 'api-url-missing'
  | 'supabase-config-missing'
  | 'provider-not-implemented'

export type AccessState = { mode: 'local' } | { mode: 'supabase' } | { mode: 'blocked'; reason: BlockReason }

export interface AccessInput {
  isLocal: boolean
  provider?: string
  apiBaseUrl?: string
  /** true solo si la configuración pública de Supabase es válida (ver supabase-config.ts). */
  supabaseConfigured?: boolean
}

/** Decide el modo de acceso. Función pura para poder probarla. */
export function resolveAccessState(input: AccessInput): AccessState {
  const provider = (input.provider ?? '').trim()
  // Desarrollo sin proveedor declarado: presentación local con datos sintéticos.
  if (input.isLocal && !provider) return { mode: 'local' }
  if (!provider) return { mode: 'blocked', reason: 'provider-missing' }
  if (!KNOWN_AUTH_PROVIDERS.includes(provider)) return { mode: 'blocked', reason: 'provider-unknown' }
  if (!(input.apiBaseUrl ?? '').trim()) return { mode: 'blocked', reason: 'api-url-missing' }
  if (provider === 'supabase' && !input.supabaseConfigured) {
    return { mode: 'blocked', reason: 'supabase-config-missing' }
  }
  if (!IMPLEMENTED_AUTH_PROVIDERS.includes(provider)) return { mode: 'blocked', reason: 'provider-not-implemented' }
  return { mode: 'supabase' }
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

/** true solo cuando la sesión local puede utilizarse (desarrollo sin proveedor declarado). */
export const LOCAL_ACCESS_ENABLED = ACCESS_STATE.mode === 'local'

/** true solo cuando el acceso real con Supabase Auth está activo. */
export const SUPABASE_ACCESS_ENABLED = ACCESS_STATE.mode === 'supabase'

export interface FeatureFlags {
  /** Selector de empresa para QA local. Solo modo local. */
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
  /** Recuperación de contraseña (solo local: su pantalla no está verificada en ningún entorno). */
  passwordRecovery: boolean
}

/** Funciones disponibles por modo de acceso. Fuera del modo local, todas quedan desactivadas. */
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

export const FEATURES: FeatureFlags = buildFeatures(LOCAL_ACCESS_ENABLED)
