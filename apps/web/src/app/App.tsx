import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { LOCAL_ACCESS_ENABLED, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { RepositoryContext, loadLocalRepository, type PortalRepository } from '@/services/repositories'
import { SessionProvider } from '@/features/auth/session-context'
import { firstUserOfTenant } from '@/features/auth/local-auth'
import { bootstrapLocalSession } from '@/features/auth/auth-gateway'
import { loadSupabasePortal, SupabasePortalContext, type SupabasePortal } from '@/services/auth/supabase-runtime'
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
 * - Supabase (producción y desarrollo con proveedor declarado): crea el portal (cliente de Supabase y API) antes de
 *   montar las rutas. Sin configuración válido, el portal es null y las rutas no conceden acceso.
 * - Presentación local (solo desarrollo sin proveedor): carga el repositorio sintético y restablece la sesión
 *   desde la cookie del servidor local antes de montar las rutas.
 * - Bloqueado: no hay fuente de datos; las rutas bloquean el acceso.
 */
export function App() {
  const [repo, setRepo] = useState<PortalRepository | null>(null)
  const [portal, setPortal] = useState<SupabasePortal | null>(null)
  const [ready, setReady] = useState(!(SUPABASE_ACCESS_ENABLED || (import.meta.env.DEV && LOCAL_ACCESS_ENABLED)))
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (SUPABASE_ACCESS_ENABLED) {
      loadSupabasePortal().then((p) => {
        if (cancelled) return
        setPortal(p)
        setReady(true)
      })
    } else if (import.meta.env.DEV && LOCAL_ACCESS_ENABLED) {
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
    }
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return <BootScreen error={bootError} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SupabasePortalContext.Provider value={portal}>
        <RepositoryContext.Provider value={portal?.repo ?? repo}>
          <ToastProvider>
            <SessionProvider firstUserOf={repo ? (tenantId) => firstUserOfTenant(repo, tenantId) : undefined}>
              <RouterProvider router={router} />
            </SessionProvider>
          </ToastProvider>
        </RepositoryContext.Provider>
      </SupabasePortalContext.Provider>
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
