/**
 * Mapa de rutas del portal (TanStack Router, definición por código).
 *
 * Tres grupos:
 * - Públicas: /login, /registro, /recuperar-contrasena, /restablecer-contrasena, /terminos, /privacidad.
 * - Autenticadas: bajo el layout "app" (AppShell). Su beforeLoad exige un token vigente de Supabase (modo
 *   supabase) o una sesión de desarrollo (modo local); si no, redirige a /login con el destino original.
 * - Marketplace: visible solo con FEATURES.marketplace; en otro caso responde como no encontrada.
 *
 * Decisión no evidente: la guarda vive en beforeLoad y no como <Navigate> dentro de la shell. Un
 * redireccionamiento durante el render dejó la aplicación colgada en un bucle (ver docs/validation.md).
 * Las pantallas pesadas se cargan con lazy() por ruta; la shell envuelve el contenido en Suspense.
 */
import { lazy } from 'react'
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/layouts/app-shell'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/recovery-pages'
import { TermsPage, PrivacyPage } from '@/features/legal/legal-pages'
import { readStoredSession } from '@/features/auth/session-storage'
import { FEATURES, LOCAL_ACCESS_ENABLED, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { loadSupabasePortal } from '@/services/auth/supabase-runtime'
import { loadStaffStatus } from '@/services/auth/staff-status'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { StaffPanelPage } from '@/features/support/staff-panel-page'
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
const ProfilePage = lazy(() => import('@/features/account/profile-page').then((m) => ({ default: m.ProfilePage })))
const AccountPage = lazy(() => import('@/features/account/account-page').then((m) => ({ default: m.AccountPage })))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page').then((m) => ({ default: m.DocumentsPage })))
const ClientDocumentsPage = lazy(() =>
  import('@/features/documents/client-documents-page').then((m) => ({ default: m.ClientDocumentsPage })),
)

/** Documentos: en modo Supabase, la pantalla real de cliente final; en desarrollo local, la presentación anterior. */
function DocumentsRoute() {
  return SUPABASE_ACCESS_ENABLED ? <ClientDocumentsPage /> : <DocumentsPage />
}
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
})

const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/registro', component: RegisterPage })
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/recuperar-contrasena', component: ForgotPasswordPage })
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restablecer-contrasena',
  // El token viaja solo en el enlace temporal; no se guarda en el navegador.
  validateSearch: (raw: Record<string, unknown>) => ({ token: typeof raw.token === 'string' ? raw.token.slice(0, 200) : undefined }),
  component: ResetPasswordPage,
})
const termsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminos', component: TermsPage })
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacidad', component: PrivacyPage })

/**
 * Panel de soporte del personal interno. Vive bajo el layout `app` (mismo shell y navegación); el personal puede
 * no tener empresa propia. El servidor decide si la persona tiene un rol interno activo.
 */
const supportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/soporte',
  beforeLoad: async ({ location }) => {
    const portal = await loadSupabasePortal()
    if (!SUPABASE_ACCESS_ENABLED || !portal || !(await portal.auth.accessToken())) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
    // Un cliente externo no entra al panel interno. Un fallo de red no concede nada: la pantalla lo muestra.
    if ((await loadStaffStatus()).kind === 'client') throw redirect({ to: '/' })
  },
  component: StaffPanelPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  // Guarda de acceso: sin sesión válida para el modo activo, no se monta ninguna pantalla autenticada.
  // Supabase: exige un token vigente (la cuenta se valida después contra la API). Local: sesión de desarrollo.
  beforeLoad: async ({ location }) => {
    if (LOCAL_ACCESS_ENABLED && readStoredSession()) return
    if (SUPABASE_ACCESS_ENABLED) {
      const portal = await loadSupabasePortal()
      if (portal && (await portal.auth.accessToken())) return
    }
    throw redirect({ to: '/login', search: { redirect: location.pathname } })
  },
  component: AppShell,
})

/**
 * Inicio de cliente. El personal interno con rol activo no tiene empresa propia: va directo a /soporte.
 * La decisión usa el mismo resultado de /api/v1/staff/me que el contexto de sesión (una sola petición).
 */
const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: async () => {
    if (!SUPABASE_ACCESS_ENABLED) return
    if ((await loadStaffStatus()).kind === 'staff') throw redirect({ to: '/soporte' })
  },
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
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/perfil', component: ProfilePage })
const documentsRoute = createRoute({ getParentRoute: () => appRoute, path: '/documentos', component: DocumentsRoute })
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
  registerRoute,
  forgotRoute,
  resetRoute,
  termsRoute,
  privacyRoute,
  appRoute.addChildren([
    dashboardRoute,
    supportRoute,
    operationsRoute,
    operationDetailRoute,
    accountRoute,
    profileRoute,
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
