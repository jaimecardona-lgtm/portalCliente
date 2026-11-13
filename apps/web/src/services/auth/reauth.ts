/**
 * Reautenticación con contraseña para el cambio de empresa de trabajo.
 *
 * Responsabilidad: comprobar la contraseña de la cuenta actual con Supabase Auth y devolver un token de acceso
 * nuevo (con amr "password") para que FastAPI confirme el cambio.
 * Reglas:
 * - Usa UN solo cliente temporal, creado de forma perezosa y reutilizado. Tiene clave y almacenamiento propios
 *   (en memoria), así que nunca comparte `sb-<ref>-auth-token` con la sesión principal ni la reemplaza.
 * - Sin persistencia ni renovación automática. Tras leer el token se cierra su sesión local.
 * - La contraseña solo viaja a Supabase Auth. No se envía a FastAPI, no se guarda y no se registra.
 * - El token nuevo se usa una vez en el servidor y se descarta aquí.
 */
import { readSupabaseConfig, type SupabaseEnv } from './supabase-config'

export class PasswordRejectedError extends Error {
  constructor() {
    super('La contraseña no es correcta.')
    this.name = 'PasswordRejectedError'
  }
}

type TemporaryClient = {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { session: { access_token: string } | null }
      error: unknown
    }>
    signOut(options?: { scope?: 'local' | 'global' | 'others' }): Promise<unknown>
  }
}

let temporary: TemporaryClient | null = null

async function temporaryClient(env: SupabaseEnv): Promise<TemporaryClient | null> {
  if (temporary) return temporary
  const config = readSupabaseConfig(env)
  if (!config) return null
  const { createClient } = await import('@supabase/supabase-js')
  const memory = new Map<string, string>()
  temporary = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      storageKey: 'sb-reauth-temporary',
      storage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => void memory.set(key, value),
        removeItem: (key: string) => void memory.delete(key),
      },
    },
  }) as unknown as TemporaryClient
  return temporary
}

export async function reauthenticateWithPassword(email: string, password: string, env: SupabaseEnv): Promise<string> {
  const client = await temporaryClient(env)
  if (!client) throw new Error('La autenticación no está configurada.')
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  const token = data.session?.access_token
  // Se cierra la sesión temporal (solo memoria) para no conservar el token tras la comprobación.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  if (error || !token) throw new PasswordRejectedError()
  return token
}
