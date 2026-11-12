import type { User } from '@/types/domain'

/** Cuenta del portal tal como la devuelve el servidor local (sin credenciales). */
export interface AccountProfile {
  id: string
  tenantId: string
  fullName: string
  email: string
  role: string
  status: string
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
  termsVersionAccepted: string | null
  termsAcceptedAt: string | null
}

/** Convierte la cuenta del servidor al modelo de usuario que usan las pantallas. */
export function toDomainUser(u: Pick<AccountProfile, 'id' | 'tenantId' | 'fullName' | 'email' | 'role'>): User {
  return {
    id: u.id,
    tenantId: u.tenantId,
    fullName: u.fullName,
    email: u.email,
    role: u.role === 'client' ? 'Cliente' : 'Consulta',
  }
}
