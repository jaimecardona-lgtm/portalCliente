import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FEATURES } from '@/config/runtime'
import { useOptionalRepository } from '@/services/repositories'
import type { ID, Session, Tenant, User } from '@/types/domain'
import { readStoredSession, writeStoredSession } from './session-storage'

interface SessionContextValue {
  session: Session | null
  /** Usuario autenticado resuelto desde el repositorio (null mientras carga o sin sesión). */
  user: User | null
  tenant: Tenant | null
  isResolving: boolean
  /** Cambio de empresa. Solo existe en presentación local (`FEATURES.tenantSwitcher`). */
  switchTenant: (tenantId: ID) => Promise<void>
  signIn: (session: Session) => void
  signOut: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children, firstUserOf }: { children: ReactNode; firstUserOf?: (tenantId: ID) => Promise<User | null> }) {
  const repo = useOptionalRepository()
  const [session, setSession] = useState<Session | null>(() => readStoredSession())

  const signIn = useCallback((next: Session) => {
    writeStoredSession(next)
    setSession(next)
  }, [])

  const signOut = useCallback(() => {
    writeStoredSession(null)
    setSession(null)
  }, [])

  const switchTenant = useCallback(
    async (tenantId: ID) => {
      if (!FEATURES.tenantSwitcher || !firstUserOf) {
        throw new Error('El cambio de empresa no está disponible en este entorno.')
      }
      const user = await firstUserOf(tenantId)
      if (!user) throw new Error('La empresa seleccionada no tiene usuarios registrados.')
      const next: Session = { userId: user.id, tenantId, simulated: true }
      writeStoredSession(next)
      setSession(next)
    },
    [firstUserOf],
  )

  const identityQuery = useQuery({
    queryKey: ['identity', session?.tenantId ?? null, session?.userId ?? null],
    enabled: session !== null && repo !== null,
    queryFn: async () => {
      if (!session || !repo) return { user: null, tenant: null }
      const [user, tenant] = await Promise.all([
        repo.getUser(session.tenantId, session.userId),
        repo.getTenant(session.tenantId),
      ])
      return { user, tenant }
    },
  })

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: identityQuery.data?.user ?? null,
      tenant: identityQuery.data?.tenant ?? null,
      isResolving: session !== null && identityQuery.isPending,
      switchTenant,
      signIn,
      signOut,
    }),
    [session, identityQuery.data, identityQuery.isPending, switchTenant, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider')
  return ctx
}

/** Clave de consulta acotada a la empresa: evita mezclar caché entre tenants. */
export function tenantKey(tenantId: ID, ...rest: unknown[]): unknown[] {
  return ['tenant', tenantId, ...rest]
}
