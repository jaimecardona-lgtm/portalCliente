/**
 * Reautenticación con contraseña para el cambio de empresa de trabajo.
 *
 * Responsabilidad: comprobar la contraseña de la cuenta actual con Supabase Auth y devolver un token de acceso
 * nuevo (con amr "password") para que FastAPI confirme el cambio.
 * Reglas:
 * - Usa un cliente temporal SIN persistencia: no lee, no escribe ni cierra la sesión principal.
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

export async function reauthenticateWithPassword(email: string, password: string, env: SupabaseEnv): Promise<string> {
  const config = readSupabaseConfig(env)
  if (!config) throw new Error('La autenticación no está configurada.')
  const { createClient } = await import('@supabase/supabase-js')
  const temporary = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
  })
  const { data, error } = await temporary.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error || !data.session?.access_token) throw new PasswordRejectedError()
  return data.session.access_token
}
