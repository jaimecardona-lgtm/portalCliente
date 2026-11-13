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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURES, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { useOptionalRepository } from '@/services/repositories'
import type { CurrentAccount } from '@/services/api/mappers'
import { accountIssueFor, type AccountIssue } from '@/services/auth/account-issues'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { resetStaffStatus, staffStatusFor, type StaffStatus } from '@/services/auth/staff-status'
import { clearPersistedStaffTenant, setActiveStaffTenant, useActiveStaffTenant } from '@/services/auth/staff-context'
import type { StaffMe } from '@/services/api/staff-api'
import type { ID, Session, Tenant, User } from '@/types/domain'
import { readStoredSession, writeStoredSession } from './session-storage'

interface SessionContextValue {
  session: Session | null
  /** Usuario resuelto desde el repositorio local (null en modo Supabase y mientras carga). */
  user: User | null
  tenant: Tenant | null
  /** Cuenta que devuelve el servidor (solo modo Supabase). */
  account: CurrentAccount | null
  /** Personal interno con rol activo (solo modo Supabase). Es independiente de la empresa de `session`. */
  staff: StaffMe | null
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
      staff: null,
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
/** Tipo de cuenta (personal o cliente). Se decide antes de pedir /api/v1/me. */
const STAFF_STATUS_KEY = ['supabase', 'staff-status'] as const

/** Motivo visible por el que la cuenta no puede usar el portal de cliente. */
function resolveAccountIssue(signedOut: boolean, status: StaffStatus | null, error: unknown): AccountIssue | null {
  if (signedOut) return 'session'
  if (status === null) return null
  if (status.kind === 'staff') return 'staff'
  if (status.kind === 'unknown') return 'unavailable'
  return accountIssueFor(error)
}

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

  // Primero se decide el tipo de cuenta. Solo una cuenta de cliente pide /api/v1/me.
  const staffQuery = useQuery({
    queryKey: STAFF_STATUS_KEY,
    enabled: portal !== null && !signedOut,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<StaffStatus> => {
      if (!portal) throw new Error('El portal de autenticación no está disponible.')
      return staffStatusFor(portal.staff)
    },
  })
  const staffStatus: StaffStatus | null = staffQuery.data ?? null
  const isClient = staffStatus?.kind === 'client'

  const accountQuery = useQuery({
    queryKey: ACCOUNT_KEY,
    enabled: portal !== null && isClient,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!portal) throw new Error('El portal de autenticación no está disponible.')
      return portal.repo.refreshCurrentAccount()
    },
  })

  // Cambios de sesión de Supabase (inicio, cierre en otra pestaña, caducidad): se vuelve a decidir el tipo de cuenta.
  /*
   * Solo un cierre de sesión, un cambio de usuario o la pérdida de sesión borran la empresa de trabajo. Las
   * renovaciones del mismo usuario (TOKEN_REFRESHED, INITIAL_SESSION al volver a la pestaña) no la tocan.
   */
  const lastUserId = useRef<string | null>(null)
  useEffect(() => {
    if (!portal) return undefined
    return portal.auth.onSessionChange(({ hasSession, event, userId }) => {
      const ended = !hasSession || event === 'SIGNED_OUT'
      const switchedUser = lastUserId.current !== null && userId !== lastUserId.current
      lastUserId.current = hasSession ? userId : null
      if (ended || switchedUser) {
        resetStaffStatus()
        setActiveStaffTenant(null)
        clearPersistedStaffTenant()
      }
      setSignedOut(!hasSession)
      void queryClient.invalidateQueries({ queryKey: STAFF_STATUS_KEY })
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
    })
  }, [portal, queryClient])

  const account = signedOut || accountQuery.error || !isClient ? null : (accountQuery.data ?? null)
  const accountIssue = resolveAccountIssue(signedOut, staffStatus, accountQuery.error)
  const resolving = portal !== null && !signedOut && (staffStatus === null || (isClient && accountQuery.isPending))

  // Personal interno: su sesión de trabajo es la empresa seleccionada (nunca una membresía ficticia).
  const activeStaff = useActiveStaffTenant()
  const session = useMemo<Session | null>(() => {
    if (account) return { userId: account.userId, tenantId: account.tenant.id, simulated: false }
    if (staffStatus?.kind === 'staff' && activeStaff && !signedOut) {
      return { userId: staffStatus.me.userId, tenantId: activeStaff.id, simulated: false }
    }
    return null
  }, [account, staffStatus, activeStaff, signedOut])

  const refreshAccount = useCallback(async () => {
    setSignedOut(false)
    resetStaffStatus()
    await queryClient.invalidateQueries({ queryKey: STAFF_STATUS_KEY })
    await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
  }, [queryClient])

  const signOut = useCallback(async () => {
    setSignedOut(true)
    resetStaffStatus()
    setActiveStaffTenant(null)
    try {
      await portal?.auth.signOut()
    } finally {
      await queryClient.invalidateQueries({ queryKey: STAFF_STATUS_KEY })
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
      staff: staffStatus?.kind === 'staff' ? staffStatus.me : null,
      accountIssue,
      isResolving: resolving,
      switchTenant,
      // En modo Supabase la sesión la crea el proveedor: aquí solo se vuelve a leer la cuenta.
      signIn: () => {
        void refreshAccount()
      },
      signOut,
      refreshAccount,
    }),
    [session, account, staffStatus, accountIssue, portal, resolving, switchTenant, signOut, refreshAccount],
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
