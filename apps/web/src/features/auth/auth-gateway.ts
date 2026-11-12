/**
 * Puente entre la interfaz de autenticación y la API local de desarrollo.
 *
 * Responsabilidad: cargar de forma diferida la API local, convertir la cuenta del servidor al modelo de
 * usuario de la aplicación y restablecer la sesión del navegador al arrancar.
 * Dependencias: account-mapping (conversión), session-storage (sesión del navegador), repositorio local.
 * Restricciones: loadLocalAuthApi devuelve null fuera de desarrollo; el import dinámico impide que
 * el cliente de autenticación llegue al bundle de producción (verificado con verify:bundle).
 * Decisión no evidente: la sessionStorage es solo una copia de conveniencia. La identidad real la
 * decide la cookie HttpOnly que valida el servidor.
 */
import { LOCAL_ACCESS_ENABLED } from '@/config/runtime'
import type { PortalRepository } from '@/services/repositories/portal-repository'
import type { Session, User } from '@/types/domain'
import { writeStoredSession } from './session-storage'
import { toDomainUser, type AccountProfile } from './account-mapping'

/**
 * Acceso a la API local de autenticación.
 * La importación es diferida y está protegida por import.meta.env.DEV: en producción devuelve null
 * y el módulo no forma parte del bundle. Además, solo existe en el modo local: con Supabase activo
 * (también en desarrollo) nunca se crea una cuenta ni una sesión JSON.
 */
export async function loadLocalAuthApi() {
  if (!import.meta.env.DEV || !LOCAL_ACCESS_ENABLED) return null
  return import('@/services/local-auth-api')
}

/** Inserta la cuenta en el repositorio de presentación y devuelve la sesión correspondiente. */
export async function sessionForAccount(repo: PortalRepository | null, account: AccountProfile): Promise<Session> {
  const user: User = toDomainUser(account)
  await repo?.replaceUser?.(user)
  return { userId: user.id, tenantId: user.tenantId, simulated: false }
}

/**
 * Al cargar la aplicación (desarrollo), restablece la sesión desde la cookie validada por el servidor.
 * Si la cookie no existe o caducó, borra la sesión del navegador: la guarda de rutas redirigirá a login.
 */
export async function bootstrapLocalSession(repo: PortalRepository | null): Promise<void> {
  if (!import.meta.env.DEV || !repo) return
  const api = await loadLocalAuthApi()
  if (!api) return
  const account = await api.getSessionAccount()
  if (!account) {
    writeStoredSession(null)
    return
  }
  writeStoredSession(await sessionForAccount(repo, account))
}
