import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/services/repositories'
import type { ID, Session, Tenant, User } from '@/types/domain'
import { firstUserOfTenant, readStoredSession, writeStoredSession } from './demo-auth'

interface SessionContextValue {
  session: Session | null
  /** Usuario autenticado resuelto desde el repositorio (null mientras carga o sin sesión). */
  user: User | null
  tenant: Tenant | null
  isResolving: boolean
  /** Selector de empresa: SOLO disponible como simulación explícita en modo DEMO. */
  simulateTenant: (tenantId: ID) => Promise<void>
  signIn: (session: Session) => void
  signOut: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const repo = useRepository()
  const [session, setSession] = useState<Session | null>(() => readStoredSession())

  const signIn = useCallback((next: Session) => {
    writeStoredSession(next)
    setSession(next)
  }, [])

  const signOut = useCallback(() => {
    writeStoredSession(null)
    setSession(null)
  }, [])

  const simulateTenant = useCallback(
    async (tenantId: ID) => {
      const user = await firstUserOfTenant(repo, tenantId)
      if (!user) throw new Error('La empresa seleccionada no tiene usuarios de demostración.')
      const next: Session = { userId: user.id, tenantId, simulated: true }
      writeStoredSession(next)
      setSession(next)
    },
    [repo],
  )

  const identityQuery = useQuery({
    queryKey: ['identity', session?.tenantId ?? null, session?.userId ?? null],
    enabled: session !== null,
    queryFn: async () => {
      if (!session) return { user: null, tenant: null }
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
      simulateTenant,
      signIn,
      signOut,
    }),
    [session, identityQuery.data, identityQuery.isPending, simulateTenant, signIn, signOut],
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
