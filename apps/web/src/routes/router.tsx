import { lazy } from 'react'
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/layouts/app-shell'
import { LoginPage } from '@/features/auth/login-page'
import { readStoredSession } from '@/features/auth/session-storage'
import { FEATURES, LOCAL_ACCESS_ENABLED } from '@/config/runtime'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { parseOperationSearch, toSearchParams } from '@/features/operations/filters'
import { NotFoundPage } from './not-found'

/**
 * Rutas del portal.
 * - Login y torre de control se cargan en el bundle inicial (primera pantalla).
 * - El resto de módulos se carga bajo demanda por ruta (code splitting).
 * Las rutas autenticadas viven bajo el layout `app`, que exige acceso habilitado y sesión.
 */

const OperationsPage = lazy(() => import('@/features/operations/operations-page').then((m) => ({ default: m.OperationsPage })))
const OperationDetailPage = lazy(() => import('@/features/operations/operation-detail-page').then((m) => ({ default: m.OperationDetailPage })))
const AccountPage = lazy(() => import('@/features/account/account-page').then((m) => ({ default: m.AccountPage })))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page').then((m) => ({ default: m.DocumentsPage })))
const QuotesListPage = lazy(() => import('@/features/quotes/quotes-pages').then((m) => ({ default: m.QuotesListPage })))
const QuoteDetailPage = lazy(() => import('@/features/quotes/quotes-pages').then((m) => ({ default: m.QuoteDetailPage })))
const RequestsListPage = lazy(() => import('@/features/requests/requests-pages').then((m) => ({ default: m.RequestsListPage })))
const NewRequestPage = lazy(() => import('@/features/requests/requests-pages').then((m) => ({ default: m.NewRequestPage })))
const MarketplacePage = lazy(() => import('@/features/marketplace/marketplace-page').then((m) => ({ default: m.MarketplacePage })))

/** Marketplace solo existe cuando su función está activa. En otro caso responde como ruta inexistente. */
function MarketplaceRoute() {
  return FEATURES.marketplace ? <MarketplacePage /> : <NotFoundPage />
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  validateSearch: (raw: Record<string, unknown>) => ({
    redirect: typeof raw.redirect === 'string' ? raw.redirect : undefined,
  }),
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  // Guarda de acceso: sin acceso habilitado o sin sesión, no se monta ninguna pantalla autenticada.
  beforeLoad: ({ location }) => {
    if (!LOCAL_ACCESS_ENABLED || !readStoredSession()) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
  },
  component: AppShell,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: DashboardPage,
})

const operationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/operaciones',
  // Los filtros viven en la URL: son compartibles y sobreviven a recargas.
  validateSearch: (raw: Record<string, unknown>) => toSearchParams(parseOperationSearch(raw)),
  component: function OperationsRoute() {
    const search = operationsRoute.useSearch()
    return <OperationsPage search={search} />
  },
})

const operationDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/operaciones/$operationId',
  component: function OperationDetailRoute() {
    const { operationId } = operationDetailRoute.useParams()
    return <OperationDetailPage operationId={operationId} />
  },
})

const accountRoute = createRoute({ getParentRoute: () => appRoute, path: '/cuenta', component: AccountPage })
const documentsRoute = createRoute({ getParentRoute: () => appRoute, path: '/documentos', component: DocumentsPage })
const quotesRoute = createRoute({ getParentRoute: () => appRoute, path: '/cotizaciones', component: QuotesListPage })

const quoteDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cotizaciones/$quoteId',
  component: function QuoteDetailRoute() {
    const { quoteId } = quoteDetailRoute.useParams()
    return <QuoteDetailPage quoteId={quoteId} />
  },
})

const requestsRoute = createRoute({ getParentRoute: () => appRoute, path: '/solicitudes', component: RequestsListPage })
const newRequestRoute = createRoute({ getParentRoute: () => appRoute, path: '/solicitudes/nueva', component: NewRequestPage })
const marketplaceRoute = createRoute({ getParentRoute: () => appRoute, path: '/marketplace', component: MarketplaceRoute })

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    operationsRoute,
    operationDetailRoute,
    accountRoute,
    documentsRoute,
    quotesRoute,
    quoteDetailRoute,
    requestsRoute,
    newRequestRoute,
    marketplaceRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: NotFoundPage,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
