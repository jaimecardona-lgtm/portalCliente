import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Package,
  MessageCircleWarning,
  FileText,
  FolderClock,
  ArrowUpRight,
  ArrowRight,
  Route as RouteIcon,
  MessagesSquare,
  Plus,
  Building2,
  ShieldAlert,
  Clock3,
  Sparkles,
} from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { Card, ErrorState, SectionHeading, Skeleton, Badge } from '@/components/ui/primitives'
import { OperationStatusBadge } from '@/components/ui/status-badge'
import { cn, daysUntil, formatDate, formatRelative } from '@/lib/format'
import { STATUS_META } from '@/features/operations/status'
import type { Operation, OperationEvent, DocumentRecord, Quote } from '@/types/domain'
import { DEMO_NOW } from '@/data/fixtures/demo-data'
import { isVisibleToClient } from '@/features/operations/thread-utils'

export function DashboardPage() {
  const repo = useRepository()
  const { session, user, tenant, isResolving } = useSession()
  const tenantId = session?.tenantId ?? ''
  const now = useMemo(() => new Date(DEMO_NOW), [])

  const ops = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId) })
  const docs = useQuery({ queryKey: tenantKey(tenantId, 'documents'), queryFn: () => repo.listDocuments(tenantId), enabled: Boolean(tenantId) })
  const quotes = useQuery({ queryKey: tenantKey(tenantId, 'quotes'), queryFn: () => repo.listQuotes(tenantId), enabled: Boolean(tenantId) })

  const eventQueries = useQueries({
    queries: (ops.data ?? []).map((op) => ({
      queryKey: tenantKey(tenantId, 'events', op.id),
      queryFn: () => repo.listOperationEvents(tenantId, op.id),
      enabled: Boolean(tenantId) && ops.isSuccess,
    })),
  })

  const error = ops.error ?? docs.error ?? quotes.error
  if (error) {
    return (
      <Card>
        <ErrorState message={error instanceof Error ? error.message : 'Error desconocido.'} onRetry={() => { void ops.refetch(); void docs.refetch(); void quotes.refetch() }} />
      </Card>
    )
  }

  const loading = ops.isPending || docs.isPending || quotes.isPending
  const operations = ops.data ?? []
  const active = operations.filter((o) => o.status !== 'Cerrado' && o.status !== 'Entregado')
  const pending = operations.filter((o) => o.pendingClientResponse)
  const pendingQuotes = (quotes.data ?? []).filter((q) => q.status === 'Pendiente' && daysUntil(q.validUntil, now) >= 0)
  const expiredDocs = (docs.data ?? []).filter((d) => d.status === 'vencido')
  const soonDocs = (docs.data ?? []).filter((d) => d.status === 'por_vencer')

  const events: Array<OperationEvent & { doNumber: string }> = eventQueries
    .flatMap((q, i) => (q.data ?? []).map((e) => ({ ...e, doNumber: operations[i]?.doNumber ?? '' })))
    .filter((e) => isVisibleToClient(e.visibility))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 6)

  const firstName = user?.fullName.split(' ')[0] ?? ''

  return (
    <div className="flex flex-col gap-6">
      <Hero
        greeting={greeting(now)}
        firstName={firstName}
        companyName={tenant?.legalName ?? ''}
        resolving={isResolving}
        activeCount={active.length}
        pendingCount={pending.length}
        manager={tenant?.accountManager}
      />

      {/* Indicadores */}
      <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard to="/operaciones" search={{ status: 'En tránsito,En puerto,En aduana' }} label="Operaciones activas" value={loading ? null : active.length} hint="En tránsito, puerto o aduana" icon={Package} tone="blue" />
        <KpiCard to="/operaciones" search={{ pendiente: '1' }} label="Esperan su respuesta" value={loading ? null : pending.length} hint="Operaciones con acción requerida" icon={MessageCircleWarning} tone={pending.length > 0 ? 'danger' : 'neutral'} />
        <KpiCard to="/cotizaciones" label="Cotizaciones pendientes" value={loading ? null : pendingQuotes.length} hint="Vigentes y sin decisión" icon={FileText} tone="cyan" />
        <KpiCard to="/documentos" label="Documentos vencidos" value={loading ? null : expiredDocs.length} hint={soonDocs.length > 0 ? `${soonDocs.length} por vencer en 45 días` : 'Sin vencimientos próximos'} icon={FolderClock} tone={expiredDocs.length > 0 ? 'danger' : 'success'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Operaciones críticas */}
        <Card className="min-w-0 p-5 sm:p-6">
          <SectionHeading
            title="Seguimiento de operaciones"
            description="Ordenadas por ETA para priorizar lo que llega primero"
            action={<Link to="/operaciones" className="inline-flex items-center gap-1 text-sm font-semibold text-blue hover:underline">Ver todas <ArrowUpRight className="size-3.5" aria-hidden /></Link>}
          />
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : active.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">No hay operaciones activas en este momento.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {[...active].sort((a, b) => (a.eta ?? '9999').localeCompare(b.eta ?? '9999')).slice(0, 5).map((op) => (
                <CriticalRow key={op.id} op={op} now={now} />
              ))}
            </ul>
          )}
        </Card>

        {/* Alertas */}
        <Card className="min-w-0 p-5 sm:p-6">
          <SectionHeading title="Alertas y decisiones" description="Lo que necesita su atención" />
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : (
            <AlertList pending={pending} expired={expiredDocs} soon={soonDocs} quotes={pendingQuotes} now={now} />
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Rutas */}
        <Card className="min-w-0 p-5 sm:p-6">
          <SectionHeading title="Rutas activas" description="Corredores con operaciones en curso" action={<RouteIcon className="size-4 text-ink-muted" aria-hidden />} />
          <RoutesList ops={active} />
        </Card>

        {/* Actividad reciente */}
        <Card className="min-w-0 p-5 sm:p-6">
          <SectionHeading title="Actividad reciente" description="Últimos eventos de sus operaciones" />
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Aún no hay actividad registrada.</p>
          ) : (
            <ol className="relative ml-2 flex flex-col gap-4 border-l border-line pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden className={cn('absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface', e.type === 'action_required' ? 'bg-danger' : e.type === 'document' ? 'bg-cyan' : 'bg-blue')} />
                  <Link to="/operaciones/$operationId" params={{ operationId: e.operationId }} className="group block">
                    <p className="text-xs text-ink-muted tabular">
                      <span className="font-mono font-semibold text-blue">{e.doNumber}</span> · {formatRelative(e.occurredAt, now)}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-ink group-hover:text-blue">{e.title}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Accesos rápidos */}
      <section aria-labelledby="quick-title">
        <h2 id="quick-title" className="sr-only">Accesos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink to="/solicitudes/nueva" icon={Plus} title="Nueva solicitud" text="Consultas, documentos o cambios de datos" />
          <QuickLink to="/cotizaciones" icon={MessagesSquare} title="Revisar cotizaciones" text="Vigencia, conceptos y decisiones" />
          <QuickLink to="/cuenta" icon={Building2} title="Información de cuenta" text="Datos generales, direcciones y contactos" />
        </div>
      </section>
    </div>
  )
}

/* ---------------------------- Subcomponentes ---------------------------- */

function Hero({
  greeting: greet,
  firstName,
  companyName,
  resolving,
  activeCount,
  pendingCount,
  manager,
}: {
  greeting: string
  firstName: string
  companyName: string
  resolving: boolean
  activeCount: number
  pendingCount: number
  manager?: string
}) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-[18px] bg-midnight p-6 text-white shadow-pop sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: 'radial-gradient(700px 280px at 100% 0%, rgba(34,199,242,0.25), transparent 60%), radial-gradient(520px 240px at 0% 100%, rgba(37,99,235,0.3), transparent 60%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-cyan uppercase">
            <Sparkles className="size-3.5" aria-hidden /> Torre de control
          </p>
          <h1 id="hero-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {greet}{firstName && `, ${firstName}`}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/65">
            {resolving ? 'Cargando su empresa…' : companyName}
            {manager && <span className="text-white/45"> · Gestor: {manager}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <HeroStat label="Activas" value={activeCount} />
          <HeroStat label="Requieren respuesta" value={pendingCount} highlight={pendingCount > 0} />
        </div>
      </div>
    </section>
  )
}

function HeroStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn('min-w-[140px] rounded-xl border px-4 py-3 backdrop-blur-sm', highlight ? 'border-red-300/30 bg-danger/15' : 'border-white/10 bg-white/[0.06]')}>
      <p className="text-[11px] font-semibold tracking-wide text-white/55 uppercase">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular">{value}</p>
    </div>
  )
}

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }).format(now))
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const KPI_BAR = {
  blue: 'bg-gradient-to-r from-cyan to-blue',
  cyan: 'bg-cyan',
  danger: 'bg-gradient-to-r from-danger to-warning',
  success: 'bg-gradient-to-r from-success to-cyan',
  neutral: 'bg-gradient-to-r from-line-strong to-line-strong',
} as const

const KPI_TONES = {
  blue: 'bg-blue-50 text-blue',
  cyan: 'bg-cyan-50 text-cyan-700',
  danger: 'bg-danger-50 text-danger-700',
  success: 'bg-success-50 text-success-700',
  neutral: 'bg-surface-muted text-ink-soft',
} as const

function KpiCard({
  to,
  search,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  to: '/operaciones' | '/cotizaciones' | '/documentos'
  search?: Record<string, string>
  label: string
  value: number | null
  hint: string
  icon: typeof Package
  tone: keyof typeof KPI_TONES
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-blue/40 hover:shadow-pop sm:p-5"
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", KPI_BAR[tone])} />
      <div className="flex items-start justify-between">
        <span className={cn('grid size-9 place-items-center rounded-xl', KPI_TONES[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <ArrowUpRight className="size-4 text-ink-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-blue" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
        {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-bold tracking-tight text-ink tabular">{value}</p>}
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      </div>
    </Link>
  )
}

function CriticalRow({ op, now }: { op: Operation; now: Date }) {
  const meta = STATUS_META[op.status]
  const etaIn = op.eta ? daysUntil(op.eta, now) : null
  const progress = Math.min(meta.step, 4) / 4
  return (
    <li>
      <Link to="/operaciones/$operationId" params={{ operationId: op.id }} className="group flex items-center gap-4 py-4 transition-colors duration-150 first:pt-0 last:pb-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-sm font-semibold text-blue">{op.doNumber}</span>
            <OperationStatusBadge status={op.status} />
            {op.pendingClientResponse && <Badge tone="danger">Respuesta requerida</Badge>}
          </div>
          <p className="mt-1 truncate text-sm text-ink-soft">{op.origin} <span className="text-ink-muted">→</span> {op.destination}</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`Avance del ${Math.round(progress * 100)}%`}>
            <div className={cn('h-full rounded-full transition-[width] duration-500', meta.dot)} style={{ width: `${Math.max(progress, 0.08) * 100}%` }} />
          </div>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">ETA</p>
          <p className="text-sm font-semibold text-ink tabular">{formatDate(op.eta)}</p>
          {etaIn !== null && etaIn >= 0 && <p className="text-xs text-ink-muted tabular">en {etaIn} días</p>}
        </div>
        <ArrowRight className="size-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-blue" aria-hidden />
      </Link>
    </li>
  )
}

function AlertList({
  pending,
  expired,
  soon,
  quotes,
  now,
}: {
  pending: Operation[]
  expired: DocumentRecord[]
  soon: DocumentRecord[]
  quotes: Quote[]
  now: Date
}) {
  const items: Array<{ key: string; tone: 'danger' | 'warning' | 'info'; title: string; text: string; to: string; params?: { operationId: string } }> = []
  pending.forEach((op) =>
    items.push({ key: `op-${op.id}`, tone: 'danger', title: `${op.doNumber} requiere respuesta`, text: op.reference, to: `/operaciones/${op.id}`, params: { operationId: op.id } }),
  )
  expired.forEach((d) => items.push({ key: `dv-${d.id}`, tone: 'danger', title: `Documento vencido`, text: `${d.name} · venció el ${formatDate(d.expiresAt)}`, to: '/documentos' }))
  soon.forEach((d) => items.push({ key: `ds-${d.id}`, tone: 'warning', title: `Documento por vencer`, text: `${d.name} · vence el ${formatDate(d.expiresAt)}`, to: '/documentos' }))
  quotes
    .filter((q) => daysUntil(q.validUntil, now) <= 10)
    .forEach((q) => items.push({ key: `q-${q.id}`, tone: 'info', title: `Cotización por decidir`, text: `${q.number} · vigente hasta ${formatDate(q.validUntil)}`, to: '/cotizaciones' }))

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-success-50 text-success-700"><ShieldAlert className="size-5" aria-hidden /></span>
        <p className="text-sm font-semibold text-ink">Todo en orden</p>
        <p className="text-xs text-ink-muted">No hay pendientes que requieran acción.</p>
      </div>
    )
  }

  return (
    <ul className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
      {items.slice(0, 8).map((item) => (
        <li key={item.key}>
          <Link
            to={item.to as '/documentos'}
            params={item.params as never}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3 transition-colors duration-200 hover:bg-surface-muted/60',
              item.tone === 'danger' && 'border-danger/25 bg-danger-50/50',
              item.tone === 'warning' && 'border-warning/30 bg-warning-50/60',
              item.tone === 'info' && 'border-blue/20 bg-blue-50/50',
            )}
          >
            <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', item.tone === 'danger' && 'bg-danger/15 text-danger-700', item.tone === 'warning' && 'bg-warning/20 text-warning-700', item.tone === 'info' && 'bg-blue/15 text-blue')}>
              {item.tone === 'info' ? <Clock3 className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{item.title}</span>
              <span className="block truncate text-xs text-ink-soft">{item.text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function RoutesList({ ops }: { ops: Operation[] }) {
  const routes = useMemo(() => {
    const map = new Map<string, { origin: string; destination: string; count: number; pending: number }>()
    ops.forEach((o) => {
      const key = `${o.origin}|${o.destination}`
      const current = map.get(key) ?? { origin: o.origin, destination: o.destination, count: 0, pending: 0 }
      current.count += 1
      if (o.pendingClientResponse) current.pending += 1
      map.set(key, current)
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [ops])

  if (routes.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Sin rutas activas.</p>
  const max = Math.max(...routes.map((r) => r.count))

  return (
    <ul className="flex flex-col gap-4">
      {routes.map((r) => (
        <li key={`${r.origin}-${r.destination}`}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="min-w-0 truncate font-medium text-ink">
              {r.origin} <span className="text-ink-muted">→</span> {r.destination}
            </p>
            <p className="shrink-0 text-xs text-ink-muted tabular">
              {r.count} {r.count === 1 ? 'operación' : 'operaciones'}
              {r.pending > 0 && <span className="ml-2 font-semibold text-danger-700">· {r.pending} pendiente(s)</span>}
            </p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan to-blue" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function QuickLink({ to, icon: Icon, title, text }: { to: '/solicitudes/nueva' | '/cotizaciones' | '/cuenta'; icon: typeof Plus; title: string; text: string }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-blue/40 hover:shadow-pop">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-midnight text-cyan">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-muted">{text}</span>
      </span>
      <ArrowRight className="size-4 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-blue" aria-hidden />
    </Link>
  )
}
