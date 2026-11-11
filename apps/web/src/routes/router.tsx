import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/layouts/app-shell'
import { LoginPage } from '@/features/auth/login-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { OperationsPage } from '@/features/operations/operations-page'
import { OperationDetailPage } from '@/features/operations/operation-detail-page'
import { parseOperationSearch, toSearchParams } from '@/features/operations/filters'
import { AccountPage } from '@/features/account/account-page'
import { DocumentsPage } from '@/features/documents/documents-page'
import { QuotesListPage, QuoteDetailPage } from '@/features/quotes/quotes-pages'
import { RequestsListPage, NewRequestPage } from '@/features/requests/requests-pages'
import { MarketplacePage } from '@/features/marketplace/marketplace-page'
import { NotFoundPage } from './not-found'

/**
 * Rutas del portal. Las rutas autenticadas viven bajo el layout `app`,
 * que valida la sesión DEMO antes de renderizar.
 */
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
const marketplaceRoute = createRoute({ getParentRoute: () => appRoute, path: '/marketplace', component: MarketplacePage })

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
