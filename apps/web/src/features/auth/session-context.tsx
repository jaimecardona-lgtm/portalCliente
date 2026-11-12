/**
 * Contexto de sesión de la aplicación.
 *
 * Responsabilidad: mantener la sesión activa ({ userId, tenantId }) y resolver el usuario y la empresa
 * para las pantallas. Expone signIn, signOut y el estado de la cuenta.
 * Dos ramas, elegidas por el modo de acceso (no por la interfaz):
 * - Local (desarrollo): sesión guardada en sessionStorage y datos del repositorio sintético.
 * - Supabase: la sesión sale de GET /api/v1/me con el token vigente de Supabase. sessionStorage no interviene.
 * Contrato: useSession debe usarse dentro de SessionProvider. user, tenant y account son null mientras cargan.
 * Aislamiento: las consultas de identidad usan claves que incluyen la empresa; la caché no mezcla empresas.
 * Decisión no evidente: en modo Supabase, `user` y `tenant` quedan null porque la API v1 no devuelve el modelo
 * de dominio completo. Las pantallas usan `account` para lo que el servidor sí expone.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURES, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { useOptionalRepository } from '@/services/repositories'
import type { CurrentAccount } from '@/services/api/mappers'
import { accountIssueFor, type AccountIssue } from '@/services/auth/account-issues'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import type { ID, Session, Tenant, User } from '@/types/domain'
import { readStoredSession, writeStoredSession } from './session-storage'

interface SessionContextValue {
  session: Session | null
  /** Usuario resuelto desde el repositorio local (null en modo Supabase y mientras carga). */
  user: User | null
  tenant: Tenant | null
  /** Cuenta que devuelve el servidor (solo modo Supabase). */
  account: CurrentAccount | null
  /** Motivo por el que la cuenta no puede usarse (solo modo Supabase). */
  accountIssue: AccountIssue | null
  isResolving: boolean
  /** Cambio de empresa. Solo existe en presentación local (`FEATURES.tenantSwitcher`). */
  switchTenant: (tenantId: ID) => Promise<void>
  signIn: (session: Session) => void
  signOut: () => void
  /** Vuelve a pedir la cuenta al servidor (tras iniciar sesión en Supabase). */
  refreshAccount: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children, firstUserOf }: { children: ReactNode; firstUserOf?: (tenantId: ID) => Promise<User | null> }) {
  if (SUPABASE_ACCESS_ENABLED) return <SupabaseSessionProvider>{children}</SupabaseSessionProvider>
  return <LocalSessionProvider firstUserOf={firstUserOf}>{children}</LocalSessionProvider>
}

const NO_REFRESH = async () => {}

function LocalSessionProvider({ children, firstUserOf }: { children: ReactNode; firstUserOf?: (tenantId: ID) => Promise<User | null> }) {
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
      account: null,
      accountIssue: null,
      isResolving: session !== null && identityQuery.isPending,
      switchTenant,
      signIn,
      signOut,
      refreshAccount: NO_REFRESH,
    }),
    [session, identityQuery.data, identityQuery.isPending, switchTenant, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** Clave de la cuenta del servidor. Una sola entrada: la sesión de Supabase es única en el navegador. */
const ACCOUNT_KEY = ['supabase', 'account'] as const

/**
 * Reglas de esta rama (importantes):
 * - TanStack Query conserva el último `data` aunque la consulta falle. Por eso la cuenta solo se usa si NO hay error.
 * - `signedOut` hace que la sesión sea null de forma inmediata al cerrar sesión, sin esperar al SDK ni a la red.
 *   Sin ello, la pantalla de login redirigiría de nuevo a la aplicación con la cuenta anterior.
 * - La cuenta se pide con `refreshCurrentAccount`, que ignora la caché del repositorio: una cuenta de una sesión
 *   anterior nunca debe mostrarse con otra persona conectada.
 */
/** Exportado para pruebas: en pruebas el modo activo es el local, así que no se elige desde SessionProvider. */
export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const portal = useContext(SupabasePortalContext)
  const queryClient = useQueryClient()
  const [signedOut, setSignedOut] = useState(false)

  const accountQuery = useQuery({
    queryKey: ACCOUNT_KEY,
    enabled: portal !== null,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!portal) throw new Error('El portal de autenticación no está disponible.')
      return portal.repo.refreshCurrentAccount()
    },
  })

  // Cambios de sesión de Supabase (inicio, cierre en otra pestaña, caducidad): se relee la cuenta.
  useEffect(() => {
    if (!portal) return undefined
    return portal.auth.onSessionChange((hasSession) => {
      setSignedOut(!hasSession)
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
    })
  }, [portal, queryClient])

  const account = signedOut || accountQuery.error ? null : (accountQuery.data ?? null)
  const accountIssue = signedOut ? 'session' : accountIssueFor(accountQuery.error)

  const session = useMemo<Session | null>(
    () => (account ? { userId: account.userId, tenantId: account.tenant.id, simulated: false } : null),
    [account],
  )

  const refreshAccount = useCallback(async () => {
    setSignedOut(false)
    await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
  }, [queryClient])

  const signOut = useCallback(async () => {
    setSignedOut(true)
    try {
      await portal?.auth.signOut()
    } finally {
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
    }
  }, [portal, queryClient])

  const switchTenant = useCallback(async () => {
    throw new Error('El cambio de empresa no está disponible en este entorno.')
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: null,
      tenant: null,
      account,
      accountIssue,
      isResolving: portal !== null && !signedOut && accountQuery.isPending,
      switchTenant,
      // En modo Supabase la sesión la crea el proveedor: aquí solo se vuelve a leer la cuenta.
      signIn: () => {
        void refreshAccount()
      },
      signOut,
      refreshAccount,
    }),
    [session, account, accountIssue, portal, accountQuery.isPending, switchTenant, signOut, refreshAccount],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Acceso al contexto de sesión. Debe usarse dentro de SessionProvider.
 * @throws Error si se usa fuera del proveedor (error de programación, no de usuario).
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider')
  return ctx
}

/** Clave de consulta acotada a la empresa: evita mezclar caché entre tenants. */
export function tenantKey(tenantId: ID, ...rest: unknown[]): unknown[] {
  return ['tenant', tenantId, ...rest]
}
