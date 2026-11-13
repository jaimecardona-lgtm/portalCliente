/**
 * Sesión en modo Supabase: la cuenta sale del servidor y el cierre de sesión es inmediato.
 * El repositorio fingido devuelve la cuenta anterior incluso después de cerrar sesión, para comprobar que la
 * interfaz no la usa (la caché de TanStack Query conserva datos tras un error y el repositorio cachea la cuenta).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetStaffStatus } from '@/services/auth/staff-status'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SupabasePortalContext, type SupabasePortal } from '@/services/auth/supabase-runtime'
import { PortalApiError } from '@/services/api/http-client'
import type { CurrentAccount } from '@/services/api/mappers'
import { SupabaseSessionProvider, useSession } from './session-context'

const ACCOUNT: CurrentAccount = {
  userId: '3f9c1a2e-0000-4000-8000-0000000000aa',
  fullName: 'Persona Sintética',
  tenant: { id: '3f9c1a2e-0000-4000-8000-0000000000bb', slug: 'tn-sintetica', legalName: 'Empresa Sintética S.A.S.' },
  role: 'client_admin',
  canComment: true,
  memberships: [{ tenantId: '3f9c1a2e-0000-4000-8000-0000000000bb', role: 'client_admin' }],
}

function Probe() {
  const { session, accountIssue, signOut, refreshAccount, isResolving } = useSession()
  return (
    <div>
      <p data-testid="user">{session?.userId ?? 'sin-sesion'}</p>
      <p data-testid="issue">{accountIssue ?? 'sin-problema'}</p>
      <p data-testid="resolving">{isResolving ? 'cargando' : 'listo'}</p>
      <button type="button" onClick={() => void signOut()}>cerrar</button>
      <button type="button" onClick={() => void refreshAccount()}>entrar</button>
    </div>
  )
}

/** Por defecto la cuenta es de cliente: /staff/me responde 403 no_staff_role. */
const NOT_STAFF = async () => {
  throw new PortalApiError('no_staff_role', 'sin rol interno', 403)
}

function setup(options: { repoAccount: () => Promise<CurrentAccount>; staffMe?: () => Promise<unknown> }) {
  let onChange: ((hasSession: boolean) => void) | undefined
  const auth = {
    signOut: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ status: 'ok' as const })),
    accessToken: vi.fn(async () => 'token-sintetico'),
    requestPasswordReset: vi.fn(async () => ({ status: 'ok' as const })),
    updatePassword: vi.fn(async () => ({ status: 'ok' as const })),
    onSessionChange: vi.fn((cb: (hasSession: boolean) => void) => {
      onChange = cb
      return () => undefined
    }),
  }
  const repo = { refreshCurrentAccount: vi.fn(options.repoAccount) }
  const staff = { me: vi.fn(options.staffMe ?? NOT_STAFF) }
  const portal = { auth, repo, staff } as unknown as SupabasePortal
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SupabasePortalContext.Provider value={portal}>
        <SupabaseSessionProvider>
          <Probe />
        </SupabaseSessionProvider>
      </SupabasePortalContext.Provider>
    </QueryClientProvider>,
  )
  return { auth, repo, staff, notifySession: (has: boolean) => onChange?.(has) }
}

describe('SupabaseSessionProvider', () => {
  beforeEach(() => resetStaffStatus())

  it('personal interno: muestra el estado "staff" sin pedir /api/v1/me', async () => {
    const staffMe = async () => ({ user_id: ACCOUNT.userId, full_name: 'Personal Sintético', staff_role: 'qa', permissions: [] })
    const { repo } = setup({ repoAccount: async () => ACCOUNT, staffMe })
    await waitFor(() => expect(screen.getByTestId('issue').textContent).toBe('staff'))
    expect(screen.getByTestId('user').textContent).toBe('sin-sesion')
    expect(repo.refreshCurrentAccount).not.toHaveBeenCalled()
  })

  it('un fallo de red en /staff/me no concede acceso: queda "no disponible" y no pide /api/v1/me', async () => {
    const staffMe = async () => {
      throw new PortalApiError('network_error', 'sin red', 0)
    }
    const { repo } = setup({ repoAccount: async () => ACCOUNT, staffMe })
    await waitFor(() => expect(screen.getByTestId('issue').textContent).toBe('unavailable'))
    expect(screen.getByTestId('user').textContent).toBe('sin-sesion')
    expect(repo.refreshCurrentAccount).not.toHaveBeenCalled()
  })

  it('la sesión sale de la cuenta del servidor', async () => {
    setup({ repoAccount: async () => ACCOUNT })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(ACCOUNT.userId))
    expect(screen.getByTestId('issue').textContent).toBe('sin-problema')
  })

  it('tras cerrar sesión la sesión es nula aunque el repositorio siga devolviendo la cuenta anterior', async () => {
    const user = userEvent.setup()
    const { auth, repo } = setup({ repoAccount: async () => ACCOUNT })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(ACCOUNT.userId))

    await user.click(screen.getByRole('button', { name: 'cerrar' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    await waitFor(() => expect(repo.refreshCurrentAccount.mock.calls.length).toBeGreaterThan(1))

    expect(screen.getByTestId('user').textContent).toBe('sin-sesion')
    expect(screen.getByTestId('issue').textContent).toBe('session')
  })

  it('un error de la cuenta (sin empresa) anula la sesión aunque hubiera datos anteriores', async () => {
    let fail = false
    const { notifySession } = setup({
      repoAccount: async () => {
        if (fail) throw new PortalApiError('no_tenant_membership', 'sin empresa', 403)
        return ACCOUNT
      },
    })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(ACCOUNT.userId))

    fail = true
    await act(async () => notifySession(true))
    await waitFor(() => expect(screen.getByTestId('issue').textContent).toBe('no-membership'))
    expect(screen.getByTestId('user').textContent).toBe('sin-sesion')
  })

  it('tras iniciar sesión de nuevo, la cuenta se vuelve a pedir y no se reutiliza la anterior', async () => {
    const user = userEvent.setup()
    const { repo } = setup({ repoAccount: async () => ACCOUNT })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(ACCOUNT.userId))

    await user.click(screen.getByRole('button', { name: 'cerrar' }))
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('sin-sesion'))

    await user.click(screen.getByRole('button', { name: 'entrar' }))
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe(ACCOUNT.userId))
    expect(repo.refreshCurrentAccount.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('resolving').textContent).toBe('listo')
  })
})
