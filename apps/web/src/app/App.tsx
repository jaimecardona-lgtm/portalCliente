import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { RepositoryContext, loadLocalRepository, type PortalRepository } from '@/services/repositories'
import { SessionProvider } from '@/features/auth/session-context'
import { firstUserOfTenant } from '@/features/auth/local-auth'
import { bootstrapLocalSession } from '@/features/auth/auth-gateway'
import { ToastProvider } from '@/components/ui/toast'
import { router } from '@/routes/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Raíz de la aplicación.
 * - Desarrollo: carga el repositorio sintético y restablece la sesión desde la cookie del servidor local
 *   antes de montar las rutas. Así una recarga conserva la sesión sin depender de datos del navegador.
 * - Producción: no hay fuente de datos local; las rutas bloquean el acceso hasta que exista backend.
 */
export function App() {
  const [repo, setRepo] = useState<PortalRepository | null>(null)
  const [ready, setReady] = useState(!import.meta.env.DEV)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false
    loadLocalRepository()
      .then(async (r) => {
        await bootstrapLocalSession(r)
        if (!cancelled) {
          setRepo(r)
          setReady(true)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'Error desconocido')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return <BootScreen error={bootError} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryContext.Provider value={repo}>
        <ToastProvider>
          <SessionProvider firstUserOf={repo ? (tenantId) => firstUserOfTenant(repo, tenantId) : undefined}>
            <RouterProvider router={router} />
          </SessionProvider>
        </ToastProvider>
      </RepositoryContext.Provider>
    </QueryClientProvider>
  )
}

function BootScreen({ error }: { error: string | null }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="text-center">
        {error ? (
          <p role="alert" className="text-sm text-danger-700">No fue posible iniciar la aplicación: {error}</p>
        ) : (
          <p className="text-sm text-ink-muted" role="status">Cargando…</p>
        )}
      </div>
    </main>
  )
}
