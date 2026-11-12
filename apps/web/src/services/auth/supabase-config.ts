/**
 * Configuración pública de Supabase para el navegador.
 *
 * Responsabilidad: leer la URL del proyecto y la clave PUBLICABLE (o la clave anónima heredada) desde las
 * variables VITE_*, que son públicas por diseño. Rechaza cualquier clave con privilegios de servicio.
 *
 * Reglas:
 * - Nunca aceptar `service_role` ni claves `sb_secret_*` en el cliente: saltan la RLS.
 * - Sin configuración, devuelve null: la aplicación usa el modo que corresponda, nunca una sesión simulada.
 * - La URL debe ser https, salvo http en loopback para desarrollo local.
 */

export interface SupabaseConfig {
  url: string
  publishableKey: string
}

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseConfigError'
  }
}

/** Decodifica el payload de un JWT sin verificar la firma (solo para leer el rol declarado). */
export function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Devuelve la configuración válida o null si faltan variables. Lanza si la configuración es insegura. */
export function readSupabaseConfig(env: SupabaseEnv): SupabaseConfig | null {
  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  if (!url && !key) return null
  if (!url || !key) {
    throw new SupabaseConfigError('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SupabaseConfigError('VITE_SUPABASE_URL no es una URL válida.')
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new SupabaseConfigError('VITE_SUPABASE_URL debe usar https.')
  }

  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new SupabaseConfigError('La clave configurada tiene privilegios de servicio. Use solo la clave publicable.')
  }

  return { url: parsed.origin, publishableKey: key }
}
