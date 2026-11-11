import type { Session } from '@/types/domain'

export const SESSION_STORAGE_KEY = 'logixtic.portal.session'

/**
 * Lectura tolerante de la sesión. El almacenamiento puede no estar disponible
 * (modo privado, bloqueado). Cualquier valor corrupto se ignora.
 *
 * La sesión guardada NO es una prueba de identidad: el backend debe validar el token en cada petición.
 */
export function readStoredSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed.userId === 'string' && typeof parsed.tenantId === 'string') {
      return { userId: parsed.userId, tenantId: parsed.tenantId, simulated: Boolean(parsed.simulated) }
    }
    return null
  } catch {
    return null
  }
}

export function writeStoredSession(session: Session | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Sin almacenamiento disponible la sesión vive solo en memoria.
  }
}
