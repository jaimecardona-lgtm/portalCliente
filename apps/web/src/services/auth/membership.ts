/**
 * Selección de empresa a partir de las membresías que devuelve el servidor (GET /api/v1/me).
 *
 * Responsabilidad: decidir si hay una única empresa, si el usuario debe elegir una, o si su elección no es
 * válida. Es solo una ayuda de interfaz: el servidor valida X-Tenant-Id y es la única autoridad.
 * Un tenant que no figure en las membresías nunca se acepta, aunque lo pida la URL o el almacenamiento.
 */
export interface MembershipLike {
  tenantId: string
}

export type TenantSelection =
  | { status: 'single'; tenantId: string }
  | { status: 'choose'; options: string[] }
  | { status: 'invalid' }
  | { status: 'none' }

export function selectTenant(memberships: MembershipLike[], chosenTenantId?: string | null): TenantSelection {
  const ids = [...new Set(memberships.map((m) => m.tenantId))]
  if (ids.length === 0) return { status: 'none' }
  if (chosenTenantId) {
    return ids.includes(chosenTenantId) ? { status: 'single', tenantId: chosenTenantId } : { status: 'invalid' }
  }
  if (ids.length === 1) return { status: 'single', tenantId: ids[0] as string }
  return { status: 'choose', options: ids }
}
