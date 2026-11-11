import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { RepositoryContext, createRepository } from '@/services/repositories'
import { SessionProvider } from '@/features/auth/session-context'
import { ToastProvider } from '@/components/ui/toast'
import { router } from '@/routes/router'

/**
 * Modo de datos: 'demo' (fixtures sintéticos). El modo 'api' se activará al integrar FastAPI.
 */
const repository = createRepository('demo')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryContext.Provider value={repository}>
        <ToastProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </ToastProvider>
      </RepositoryContext.Provider>
    </QueryClientProvider>
  )
}
