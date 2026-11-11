import type { PortalRepository } from '@/services/repositories/portal-repository'
import type { ID, User } from '@/types/domain'

/** Primer usuario de una empresa. Lo usa solo el selector de empresa de QA (entorno local). */
export async function firstUserOfTenant(repo: PortalRepository, tenantId: ID): Promise<User | null> {
  const users = await repo.listUsers(tenantId)
  return users[0] ?? null
}
