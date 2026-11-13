import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  ChevronLeft,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useEndSession } from '@/features/auth/use-end-session'
import { useRepository } from '@/services/repositories'
import { FEATURES, LOCAL_ACCESS_ENABLED, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { accountIssueMessage, roleLabel, type AccountIssue } from '@/services/auth/account-issues'
import { Card, ErrorState } from '@/components/ui/primitives'
import { Logo, LogoMark } from '@/components/brand/logo'
import { cn, daysUntil } from '@/lib/format'
import { NAV_GROUPS, STAFF_NAV_GROUPS, STAFF_ROLE_LABELS, SECTION_LABELS, type NavGroup, type NavItem } from './nav'
import { StaffTenantSelector } from '@/features/support/staff-tenant-selector'
import { StaffSectionPage } from '@/features/support/staff-module-notice'
import { useActiveStaffTenant } from '@/services/auth/staff-context'

/** Grupos de navegación según las funciones disponibles en el entorno. */
/** Selector de empresa de QA: solo en desarrollo y solo con presentación local (datos sintéticos). */
const LocalTenantSwitcher = import.meta.env.DEV
  ? lazy(() => import('./local-tenant-switcher').then((m) => ({ default: m.LocalTenantSwitcher })))
  : null

const VISIBLE_STAFF_NAV_GROUPS = STAFF_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.futureOnly || FEATURES.marketplace) })).filter((g) => g.items.length > 0)

const VISIBLE_NAV_GROUPS = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.futureOnly || FEATURES.marketplace) })).filter((g) => g.items.length > 0)

const SIDEBAR_KEY = 'logixtic.portal.sidebar-collapsed'

/** Pantallas de empresa que el personal no monta. Las listas (operaciones, cotizaciones, solicitudes) sí conservan su tabla. */
function staffSectionFor(pathname: string): { title: string; noun: string; description?: string } | null {
  if (pathname === '/documentos') return { title: 'Documentos', noun: 'documentos' }
  if (pathname === '/cuenta') return { title: 'Información de cuenta', noun: 'datos de la empresa' }
  if (pathname === '/perfil') return { title: 'Mi perfil', noun: 'datos de perfil' }
  if (pathname === '/solicitudes/nueva') return { title: 'Nueva solicitud', noun: 'solicitudes' }
  if (/^\/operaciones\/[^/]+$/.test(pathname)) return { title: 'Detalle de operación', noun: 'operaciones' }
  if (/^\/cotizaciones\/[^/]+$/.test(pathname)) return { title: 'Detalle de cotización', noun: 'cotizaciones' }
  return null
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0')
  } catch {
    /* preferencia opcional: se ignora si el almacenamiento no está disponible */
  }
}

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando pantalla">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-64 w-full" />
    </div>
  )
}

export function AppShell() {
  const { session, user, tenant, account, accountIssue, isResolving, staff } = useSession()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeStaffTenant = useActiveStaffTenant()

  useEffect(() => writeCollapsed(collapsed), [collapsed])
  useEffect(() => setDrawerOpen(false), [location.pathname])

  // Personal interno: mismo layout, sin empresa en la sesión. Sus vistas de empresa no cargan datos (ver abajo).
  const staffMode = session === null && staff !== null

  // La guarda de acceso vive en beforeLoad (router.tsx). Si no hay sesión, no se monta contenido.
  // En modo Supabase, la sesión depende de la cuenta del servidor: sin ella se muestra su estado, nunca datos de ejemplo.
  if (!session && !staffMode) {
    if (!SUPABASE_ACCESS_ENABLED) return null
    return <AccountStatus issue={accountIssue} />
  }

  const groups = staffMode ? VISIBLE_STAFF_NAV_GROUPS : VISIBLE_NAV_GROUPS
  // Personal interno: las pantallas de detalle, cuenta, perfil y documentos no se montan (consultarían datos de cliente).
  const staffSection = staffMode ? staffSectionFor(location.pathname) : null

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-pop">Saltar al contenido</a>
      {/* Sidebar escritorio */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-midnight text-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[76px]' : 'w-[260px]',
        )}
      >
        <SidebarContent groups={groups} staffMode={staffMode} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Drawer móvil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-midnight/60 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] max-w-[85vw] animate-slide-up flex-col bg-midnight text-white shadow-pop">
            <SidebarContent groups={groups} staffMode={staffMode} collapsed={false} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenMenu={() => setDrawerOpen(true)}
          staffMode={staffMode}
          companyName={
            staffMode ? (activeStaffTenant?.legalName ?? 'Personal interno') : (tenant?.shortName ?? account?.tenant.legalName ?? (isResolving ? 'Cargando…' : '—'))
          }
          userName={staffMode ? staff.fullName : (user?.fullName ?? account?.fullName ?? (isResolving ? 'Cargando…' : '—'))}
          userRole={staffMode ? (STAFF_ROLE_LABELS[staff.staffRole] ?? 'Usuario interno') : (user?.role ?? (account ? roleLabel(account.role) : ''))}
          userEmail={staffMode ? '' : (user?.email ?? '')}
        />
        <main id="contenido" className="min-w-0 flex-1 overflow-x-clip px-4 pt-6 pb-16 sm:px-6 lg:px-8" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[1400px]">
            <Suspense fallback={<PageFallback />}>
              {staffSection ? <StaffSectionPage {...staffSection} /> : <Outlet />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Lanzador Logix: en modo Supabase muestra "Próximamente" (sin respuestas); el panel solo existe en presentación local. */}
      {LogixAssistantDev && (
        <Suspense fallback={null}>
          <LogixAssistantDev />
        </Suspense>
      )}
    </div>
  )
}

/**
 * Asistente Logix: solo en desarrollo. Su motor de reglas contiene respuestas predefinidas y NO puede
 * llegar a presentación, staging ni producción (política de datos reales, CLAUDE.md).
 * `import.meta.env.DEV` se sustituye por false en producción: el import dinámico y el módulo desaparecen del bundle.
 */
const LogixAssistantDev = import.meta.env.DEV
  ? lazy(() => import('@/features/assistant/logix-assistant').then((m) => ({ default: m.LogixAssistant })))
  : null

/** Estado de la cuenta cuando no hay sesión utilizable (modo Supabase). Nunca muestra datos de ejemplo. */
function AccountStatus({ issue }: { issue: AccountIssue | null }) {
  if (issue === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-4">
        <p role="status" className="text-sm text-ink-muted">Cargando…</p>
      </main>
    )
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <Card className="w-full max-w-md">
        <ErrorState message={accountIssueMessage(issue)} />
        {issue === 'session' && (
          <div className="pb-8 text-center">
            <Link to="/login" className="font-semibold text-blue hover:underline">Ir a iniciar sesión</Link>
          </div>
        )}
        {issue === 'staff' && (
          <div className="pb-8 text-center">
            <Link to="/soporte" className="font-semibold text-blue hover:underline">Ir al panel de soporte</Link>
          </div>
        )}
      </Card>
    </main>
  )
}

function SidebarContent({
  groups,
  staffMode,
  collapsed,
  onToggle,
  onClose,
}: {
  groups: NavGroup[]
  staffMode: boolean
  collapsed: boolean
  onToggle?: () => void
  onClose?: () => void
}) {
  const { tenant } = useSession()
  return (
    <>
      <div className={cn('flex h-16 items-center border-b border-white/[0.08]', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        {collapsed ? <LogoMark /> : <Logo />}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-white/40 uppercase">{group.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {staffMode && <StaffTenantSelector collapsed={collapsed} />}

      {!collapsed && tenant && (
        <div className="mx-3 mb-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
          <p className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">Empresa activa</p>
          <p className="mt-1 truncate text-sm font-semibold">{tenant.shortName}</p>
          <p className="truncate text-xs text-white/50">Gestor: {tenant.accountManager}</p>
        </div>
      )}

      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          className={cn(
            'mx-3 mb-4 flex h-10 items-center gap-2 rounded-lg text-sm text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white',
            collapsed ? 'justify-center' : 'px-3',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!collapsed && <span>Contraer menú</span>}
        </button>
      )}
    </>
  )
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  const location = useLocation()
  const isRoot = item.to === '/'
  const active = isRoot ? location.pathname === '/' : location.pathname.startsWith(item.to)

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
        collapsed ? 'justify-center' : 'px-3',
        active ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-blue" />}
      <Icon className={cn('size-[18px] shrink-0', active && 'text-blue')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.futureOnly && (
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/60 uppercase">
          Próx.
        </span>
      )}
    </Link>
  )
}

/* ---------------- Topbar ---------------- */

function Topbar({
  onOpenMenu,
  staffMode,
  companyName,
  userName,
  userRole,
  userEmail,
}: {
  onOpenMenu: () => void
  staffMode: boolean
  companyName: string
  userName: string
  userRole: string
  userEmail: string
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="grid size-10 place-items-center rounded-lg text-ink-soft hover:bg-surface-muted lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        <div className="hidden min-w-0 flex-1 md:block">
          <Breadcrumbs />
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          {/* Búsqueda y alertas consultan operaciones de una empresa: el personal no tiene una sin seleccionar. */}
          {staffMode ? <StaffSearchDisabled /> : <GlobalSearch />}
          {import.meta.env.DEV && LOCAL_ACCESS_ENABLED && LocalTenantSwitcher && (
            <Suspense fallback={null}>
              <LocalTenantSwitcher />
            </Suspense>
          )}
          {staffMode ? <StaffAlertsDisabled /> : <AlertsBadge />}
          <ProfileMenu
            companyName={companyName}
            userName={userName}
            userRole={userRole}
            userEmail={userEmail}
            staffMode={staffMode}
          />
        </div>
      </div>
    </header>
  )
}

function Breadcrumbs() {
  const location = useLocation()
  const repo = useRepository()
  const { session } = useSession()
  const tenantId = session?.tenantId ?? ''
  const segments = location.pathname.split('/').filter(Boolean)
  const ops = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId) && segments[0] === 'operaciones', staleTime: 60_000 })
  const quotes = useQuery({ queryKey: tenantKey(tenantId, 'quotes'), queryFn: () => repo.listQuotes(tenantId), enabled: Boolean(tenantId) && segments[0] === 'cotizaciones', staleTime: 60_000 })
  const crumbs: Array<{ label: string; to: string }> = [{ label: 'Inicio', to: '/' }]
  let acc = ''
  segments.forEach((seg, index) => {
    acc += `/${seg}`
    const id = decodeURIComponent(seg)
    if (index === 0) {
      crumbs.push({ label: SECTION_LABELS[seg] ?? seg, to: acc })
    } else if (seg === 'nueva') {
      crumbs.push({ label: SECTION_LABELS.nueva ?? 'Nueva', to: acc })
    } else if (segments[0] === 'operaciones') {
      crumbs.push({ label: ops.data?.find((o) => o.id === id)?.doNumber ?? 'Detalle', to: acc })
    } else if (segments[0] === 'cotizaciones') {
      crumbs.push({ label: quotes.data?.find((q) => q.id === id)?.number ?? 'Detalle', to: acc })
    } else {
      crumbs.push({ label: id, to: acc })
    }
  })
  if (segments.length === 0) return <p className="text-sm font-semibold text-ink">Torre de control</p>
  return (
    <nav aria-label="Migas de pan" className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c.to + i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronLeft className="size-3.5 rotate-180 text-ink-muted" aria-hidden />}
            {last ? (
              <span aria-current="page" className="truncate font-semibold text-ink">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="truncate text-ink-muted hover:text-ink">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

function GlobalSearch() {
  const { session } = useSession()
  const repo = useRepository()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  // Nota: el buscador solo consulta operaciones del tenant de la sesión.
  const tenantId = session?.tenantId ?? ''

  const ops = useQuery({
    queryKey: tenantKey(tenantId, 'operations'),
    queryFn: () => repo.listOperations(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })

  const term = value.trim().toUpperCase()
  const matches = term && ops.data ? ops.data.filter((o) => o.doNumber.toUpperCase().includes(term)).slice(0, 5) : []

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!term) return
    const exact = ops.data?.find((o) => o.doNumber.toUpperCase() === term)
    if (exact) {
      setValue('')
      void navigate({ to: '/operaciones/$operationId', params: { operationId: exact.id } })
    } else {
      setValue('')
      void navigate({ to: '/operaciones', search: { q: value.trim() } as never })
    }
  }

  return (
    <div className="relative hidden w-72 sm:block lg:w-80">
      <form role="search" onSubmit={submit}>
        <label htmlFor="global-search" className="sr-only">
          Buscar operación por número DO
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          id="global-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar DO (ej. DO-26-0412)"
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm transition-colors duration-200 placeholder:text-ink-muted focus:border-blue focus:bg-surface focus:outline-none focus:ring-3 focus:ring-blue/15"
        />
      </form>
      {matches.length > 0 && (
        <ul className="absolute top-12 right-0 left-0 z-40 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop animate-fade-in" role="listbox" aria-label="Resultados">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setValue('')
                  void navigate({ to: '/operaciones/$operationId', params: { operationId: o.id } })
                }}
              >
                <span className="font-mono font-semibold text-ink">{o.doNumber}</span>
                <span className="truncate text-ink-muted">{o.reference}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Búsqueda deshabilitada para personal: buscar requiere una empresa de trabajo y su contrato de lectura. */
function StaffSearchDisabled() {
  return (
    <div className="relative hidden w-72 sm:block lg:w-80">
      <label htmlFor="global-search" className="sr-only">Buscar operación por número DO</label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        id="global-search"
        type="search"
        disabled
        value=""
        readOnly
        placeholder="Seleccione una empresa para buscar"
        className="h-10 w-full cursor-not-allowed rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm text-ink-muted placeholder:text-ink-muted"
      />
    </div>
  )
}

/** Alertas deshabilitadas para personal: no hay empresa de trabajo que contar. */
function StaffAlertsDisabled() {
  return (
    <span aria-label="Alertas: seleccione una empresa para verlas" className="relative grid size-10 place-items-center rounded-lg text-ink-muted">
      <Bell className="size-5" aria-hidden />
    </span>
  )
}

function AlertsBadge() {
  const { session } = useSession()
  const repo = useRepository()
  const tenantId = session?.tenantId ?? ''
  const ops = useQuery({
    queryKey: tenantKey(tenantId, 'operations'),
    queryFn: () => repo.listOperations(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })
  const docs = useQuery({
    queryKey: tenantKey(tenantId, 'documents'),
    queryFn: () => repo.listDocuments(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })
  const pendingOps = ops.data?.filter((o) => o.pendingClientResponse).length ?? 0
  const expired = docs.data?.filter((d) => d.status === 'vencido' || daysUntil(d.expiresAt) < 0).length ?? 0
  const total = pendingOps + expired

  return (
    <Link
      to="/"
      aria-label={`Alertas: ${total} pendientes`}
      className="relative grid size-10 place-items-center rounded-lg text-ink-soft transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
    >
      <Bell className="size-5" />
      {total > 0 && (
        <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white tabular">
          {total}
        </span>
      )}
    </Link>
  )
}

function ProfileMenu({
  companyName,
  userName,
  userRole,
  userEmail,
  staffMode,
}: {
  companyName: string
  userName: string
  userRole: string
  userEmail: string
  staffMode: boolean
}) {
  const endSession = useEndSession()
  const [open, setOpen] = useState(false)
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-lg px-1.5 hover:bg-surface-muted"
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan to-blue text-xs font-bold text-white">
          {initials || '··'}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold text-ink">{userName}</span>
          <span className="block max-w-[160px] truncate text-xs text-ink-muted">{companyName}</span>
        </span>
        <ChevronDown className="hidden size-4 text-ink-muted lg:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line p-3">
            <p className="text-sm font-semibold text-ink">{userName}</p>
            <p className="truncate text-xs text-ink-muted">{userEmail}</p>
            <p className="text-xs text-ink-muted">{userRole} · {companyName}</p>
          </div>
          <div className="p-1">
            <Link
              to="/perfil"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-muted"
            >
              Mi perfil
            </Link>
            {!staffMode && (
              <Link
                to="/cuenta"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-muted"
              >
                Información de la empresa
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger-700 hover:bg-danger-50"
              onClick={() => {
                setOpen(false)
                endSession()
              }}
            >
              <LogOut className="size-4" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
