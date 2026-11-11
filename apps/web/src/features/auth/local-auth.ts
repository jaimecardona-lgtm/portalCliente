import type { PortalRepository } from '@/services/repositories/portal-repository'
import type { ID, Session, User } from '@/types/domain'

export type AuthResult =
  | { ok: true; session: Session; user: User }
  | { ok: false; reason: 'invalid_credentials' | 'empty_fields' }

/**
 * Autenticación de PRESENTACIÓN LOCAL.
 *
 * Solo se invoca en desarrollo (`FEATURES`/`LOCAL_ACCESS_ENABLED`). Compara contra usuarios sintéticos
 * del repositorio local. No es seguridad: en producción esta función no se ejecuta y el acceso
 * debe pasar por el proveedor de identidad real y validación en FastAPI.
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

/** Primer usuario de una empresa (solo QA local, selector de empresa). */
export async function firstUserOfTenant(repo: PortalRepository, tenantId: ID): Promise<User | null> {
  const users = await repo.listUsers(tenantId)
  return users[0] ?? null
}
