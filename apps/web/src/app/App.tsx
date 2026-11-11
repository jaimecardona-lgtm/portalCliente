import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { RepositoryContext, loadLocalRepository, type PortalRepository } from '@/services/repositories'
import { SessionProvider } from '@/features/auth/session-context'
import { firstUserOfTenant } from '@/features/auth/local-auth'
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
 * - Presentación local: carga el repositorio sintético antes de montar las rutas.
 * - Producción: no hay fuente de datos local; las rutas bloquean el acceso hasta que exista backend.
 */
export function App() {
  const [repo, setRepo] = useState<PortalRepository | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false
    loadLocalRepository()
      .then((r) => {
        if (!cancelled) setRepo(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'Error desconocido')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (import.meta.env.DEV && !repo) {
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
