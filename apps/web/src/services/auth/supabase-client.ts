/**
 * Fábrica del cliente de Supabase para el navegador.
 *
 * El SDK se importa de forma diferida y solo cuando hay configuración válida. Sin variables VITE_SUPABASE_*
 * no se carga nada y la aplicación sigue en el modo que corresponda.
 *
 * Opciones: PKCE (recomendado para enlaces de recuperación), renovación automática del token y detección de
 * la sesión en la URL tras el enlace. La clave que se pasa es siempre la publicable (ver supabase-config.ts).
 */
import { readSupabaseConfig, type SupabaseEnv } from './supabase-config'
import type { SupabaseAuthLike } from './supabase-session'

export async function createBrowserAuth(env: SupabaseEnv): Promise<SupabaseAuthLike | null> {
  const config = readSupabaseConfig(env)
  if (!config) return null
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return client as unknown as SupabaseAuthLike
}
