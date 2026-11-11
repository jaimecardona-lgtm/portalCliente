import type { User } from '@/types/domain'

/**
 * Cliente del middleware de desarrollo para el usuario local de revisión.
 * Solo se usa en `vite dev` (los llamadores lo guardan con import.meta.env.DEV).
 * Ninguna contraseña ni hash viaja al cliente: la verificación ocurre en el servidor de desarrollo.
 */
const BASE = '/__local-auth'

export type ReviewerLoginResult =
  | { status: 'ok'; user: User }
  | { status: 'invalid' | 'locked' | 'not_reviewer' | 'not_configured' | 'unavailable' }

/** Perfil del usuario de revisión, o null si no está configurado o el servidor no responde. */
export async function fetchLocalReviewerProfile(): Promise<User | null> {
  try {
    const response = await fetch(`${BASE}/reviewer`, { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { status?: string; user?: User }
    return body.status === 'ok' && body.user ? body.user : null
  } catch {
    return null
  }
}

/** Verifica credenciales del usuario de revisión contra el servidor de desarrollo. */
export async function loginLocalReviewer(email: string, password: string): Promise<ReviewerLoginResult> {
  try {
    const response = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    })
    if (response.status === 429) return { status: 'locked' }
    if (response.status === 401) return { status: 'invalid' }
    if (response.status === 404) return { status: 'not_configured' }
    const body = (await response.json()) as { status?: string; user?: User }
    if (response.ok && body.status === 'ok' && body.user) return { status: 'ok', user: body.user }
    if (body.status === 'not_reviewer') return { status: 'not_reviewer' }
    return { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}
