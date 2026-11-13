/**
 * Servicio de sesión sobre Supabase Auth.
 *
 * Responsabilidad: iniciar y cerrar sesión, leer el token de acceso para la API, pedir el restablecimiento
 * de contraseña y cambiarla tras el enlace. No guarda contraseñas ni tokens: lo hace el SDK de Supabase.
 *
 * Reglas:
 * - La renovación del token la hace el SDK (autoRefreshToken). `accessToken()` siempre pide la sesión vigente.
 * - Los errores se reducen a estados ('invalid', 'unavailable'): no se muestran mensajes del proveedor.
 * - `requestPasswordReset` responde igual exista o no la cuenta (evita enumerar correos).
 * - Esta sesión NO es la sesión local de desarrollo. Ninguna sesión JSON produce un token válido.
 */

/** Forma mínima que usa la aplicación del cliente de Supabase. Lo satisface `createClient` del SDK. */
export interface SupabaseAuthLike {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { session: { access_token: string } | null }
      error: { status?: number; message: string } | null
    }>
    signOut(): Promise<{ error: { message: string } | null }>
    getSession(): Promise<{
      data: { session: { access_token: string; expires_at?: number; user?: { email?: string | null } } | null }
      error: { message: string } | null
    }>
    resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<{
      error: { message: string } | null
    }>
    updateUser(attributes: { password: string }): Promise<{ error: { message: string } | null }>
    onAuthStateChange(callback: (event: string, session: { access_token: string; user?: { id: string } | null } | null) => void): {
      data: { subscription: { unsubscribe(): void } }
    }
  }
}

/** Cambio de sesión de Supabase. `event` distingue un cierre real (SIGNED_OUT) de una simple renovación. */
export interface SessionChange {
  hasSession: boolean
  event: string
  userId: string | null
}

export type AuthOutcome = { status: 'ok' } | { status: 'invalid' } | { status: 'unavailable' }

export interface SupabaseSessionService {
  signIn(email: string, password: string): Promise<AuthOutcome>
  signOut(): Promise<void>
  /** Token de acceso vigente para FastAPI, o null si no hay sesión. */
  accessToken(): Promise<string | null>
  /** Correo de la cuenta de la sesión actual (para la reautenticación con contraseña), o null. */
  currentEmail(): Promise<string | null>
  /** Siempre responde 'ok' salvo fallo de servicio: no revela si el correo tiene cuenta. */
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthOutcome>
  /** Cambia la contraseña de la sesión creada por el enlace de recuperación. */
  updatePassword(password: string): Promise<AuthOutcome>
  /** Suscribe a cambios de sesión (inicio, renovación, cierre). Devuelve la función para cancelar. */
  onSessionChange(callback: (change: SessionChange) => void): () => void
}

function isInvalidCredentials(error: { status?: number; message: string }): boolean {
  return error.status === 400 || /invalid login credentials/i.test(error.message)
}

export function createSupabaseSessionService(client: SupabaseAuthLike): SupabaseSessionService {
  return {
    async signIn(email, password) {
      try {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) return isInvalidCredentials(error) ? { status: 'invalid' } : { status: 'unavailable' }
        return data.session ? { status: 'ok' } : { status: 'invalid' }
      } catch {
        return { status: 'unavailable' }
      }
    },

    async signOut() {
      try {
        await client.auth.signOut()
      } catch {
        // Cerrar sesión localmente: el cliente ya no debe usar tokens aunque el servidor no responda.
      }
    },

    async accessToken() {
      try {
        const { data, error } = await client.auth.getSession()
        if (error || !data.session) return null
        return data.session.access_token
      } catch {
        return null
      }
    },
    async currentEmail() {
      try {
        const { data, error } = await client.auth.getSession()
        if (error || !data.session) return null
        return data.session.user?.email ?? null
      } catch {
        return null
      }
    },

    async requestPasswordReset(email, redirectTo) {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
        return error ? { status: 'unavailable' } : { status: 'ok' }
      } catch {
        return { status: 'unavailable' }
      }
    },

    async updatePassword(password) {
      try {
        const { error } = await client.auth.updateUser({ password })
        return error ? { status: 'invalid' } : { status: 'ok' }
      } catch {
        return { status: 'unavailable' }
      }
    },

    onSessionChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) =>
        callback({ hasSession: session !== null, event, userId: session?.user?.id ?? null }),
      )
      return () => data.subscription.unsubscribe()
    },
  }
}
