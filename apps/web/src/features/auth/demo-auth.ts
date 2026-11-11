import type { PortalRepository } from '@/services/repositories/portal-repository'
import type { ID, Session, User } from '@/types/domain'
import { DEMO_PASSWORD } from '@/data/fixtures/demo-data'

export const SESSION_STORAGE_KEY = 'logixtic.portal.demo-session'

/** Contraseña pública de demostración, mostrada en pantalla a propósito. No es un secreto. */
export const DEMO_CREDENTIAL_HINT = DEMO_PASSWORD

export type AuthResult =
  | { ok: true; session: Session; user: User }
  | { ok: false; reason: 'invalid_credentials' | 'empty_fields' }

/**
 * Autenticación DEMO.
 * NO es seguridad real: compara contra usuarios sintéticos con una contraseña pública de demostración.
 * FastAPI reemplazará esta función por un flujo real con tokens y validación en servidor.
 */
export async function authenticateDemo(
  repo: PortalRepository,
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !password) return { ok: false, reason: 'empty_fields' }

  const tenants = await repo.listTenants()
  for (const tenant of tenants) {
    const users = await repo.listUsers(tenant.id)
    const match = users.find((u) => u.email.toLowerCase() === normalizedEmail)
    if (match) {
      if (match.demoPassword !== password) return { ok: false, reason: 'invalid_credentials' }
      return {
        ok: true,
        user: match,
        session: { userId: match.id, tenantId: match.tenantId, simulated: false },
      }
    }
  }
  return { ok: false, reason: 'invalid_credentials' }
}

/** Primer usuario de una empresa; se usa al cambiar de empresa en simulación. */
export async function firstUserOfTenant(repo: PortalRepository, tenantId: ID): Promise<User | null> {
  const users = await repo.listUsers(tenantId)
  return users[0] ?? null
}

/** Lectura tolerante: el almacenamiento puede no estar disponible (modo privado, bloqueado). */
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
