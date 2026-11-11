import type { ID } from '@/types/domain'

/**
 * Contratos de autenticación. Son solo tipos: la implementación local vive en el servidor de desarrollo
 * (scripts/lib/local-auth) y su cliente en services/local-auth-api.ts. Supabase Auth, PostgreSQL y FastAPI
 * deberán cumplir estas mismas interfaces para sustituirla sin reconstruir las páginas.
 */

export type AccountRole = 'client'
export type AccountStatus = 'active' | 'disabled'

/** Cuenta visible para la aplicación. Nunca contiene credenciales. */
export interface AccountView {
  id: ID
  tenantId: ID
  fullName: string
  email: string
  role: AccountRole
  status: AccountStatus
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
  termsVersionAccepted: string | null
  termsAcceptedAt: string | null
}

export type AuthResult<T = object> = ({ status: 'ok' } & T) | { status: 'invalid' | 'email_taken' | 'locked' | 'unauthenticated' | 'unavailable' }

/** Servicio de autenticación visible para las pantallas. */
export interface AuthService {
  register(input: { fullName: string; email: string; password: string; acceptTerms: boolean; termsVersion: string }): Promise<AuthResult<{ user: AccountView }>>
  login(input: { email: string; password: string; remember: boolean }): Promise<AuthResult<{ user: AccountView }>>
  logout(): Promise<void>
  currentAccount(): Promise<AccountView | null>
  requestPasswordReset(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<AuthResult>
  updateName(fullName: string): Promise<AuthResult<{ user: AccountView }>>
  changePassword(currentPassword: string, newPassword: string): Promise<AuthResult>
}

/** Persistencia de cuentas (servidor). */
export interface UserRepository {
  findByEmail(email: string): Promise<(AccountView & { passwordHash: unknown }) | null>
  findById(id: ID): Promise<(AccountView & { passwordHash: unknown }) | null>
  insert(account: AccountView & { passwordHash: unknown }): Promise<{ error?: 'email_taken' }>
  update(id: ID, patch: Partial<AccountView> & { passwordHash?: unknown }): Promise<AccountView | null>
}

/** Sesiones verificadas por el servidor. */
export interface SessionService {
  create(userId: ID, ttlMs: number): Promise<string>
  resolve(token: string | null): Promise<{ userId: ID } | null>
  destroy(token: string | null): Promise<void>
  destroyAllFor(userId: ID, keepToken?: string | null): Promise<void>
}

/** Relación usuario–empresa y permisos. Fuente de verdad del aislamiento por tenant. */
export interface TenantMembership {
  userId: ID
  tenantId: ID
  role: string
  active: boolean
}

export interface TenantMembershipRepository {
  findActive(userId: ID): Promise<TenantMembership | null>
}
