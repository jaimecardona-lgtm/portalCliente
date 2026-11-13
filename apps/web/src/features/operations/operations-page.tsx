/**
 * Listado de operaciones (/operaciones).
 *
 * Responsabilidad: tabla con columnas configurables, orden, búsqueda y filtros; versión de tarjetas en móvil.
 * Estado y URL: los filtros viven en los parámetros de la URL (compartibles y persistentes al recargar).
 * Las columnas visibles se guardan en localStorage como preferencia del usuario; si el almacenamiento falla,
 * se usan las columnas por defecto.
 * Restricciones: los datos vienen del repositorio del tenant activo. La tabla usa un contenedor con
 * scroll horizontal; los elementos sr-only de sus celdas deben tener posicionamiento relativo.
 */
import { operationAggregates } from './aggregates'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Columns3, Filter, Package, Search, X, Clock } from 'lucide-react'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useRepository } from '@/services/repositories'
import { useActiveStaffTenant } from '@/services/auth/staff-context'
import { StaffModuleNotice } from '@/features/support/staff-module-notice'
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives'
import { OperationStatusBadge } from '@/components/ui/status-badge'
import { cn, formatDate, daysUntil } from '@/lib/format'
import type { Operation } from '@/types/domain'
import { OPERATION_STATUSES, KIND_OPTIONS, TRANSPORT_OPTIONS, STATUS_META } from './status'
import {
  applyOperationFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  parseOperationSearch,
  toSearchParams,
  type OperationFilters,
  type SortKey,
} from './filters'

/* ----------------------------- Columnas ----------------------------- */

type ColumnId =
  | 'doNumber' | 'reference' | 'status' | 'kind' | 'transport' | 'owner' | 'etd' | 'eta'
  | 'ordenNumber' | 'booking' | 'route' | 'origin' | 'destination' | 'atd' | 'ata' | 'freeDays' | 'documentClosingDate'

interface ColumnDef {
  id: ColumnId
  label: string
  sortKey?: SortKey
  defaultVisible: boolean
  render: (op: Operation) => ReactNode
  className?: string
}

const COLUMNS: ColumnDef[] = [
  { id: 'doNumber', label: 'DO', sortKey: 'doNumber', defaultVisible: true, className: 'font-mono font-semibold text-ink whitespace-nowrap', render: (o) => o.doNumber },
  { id: 'reference', label: 'Referencia', defaultVisible: true, className: 'max-w-[260px]', render: (o) => <span className="block truncate">{o.reference}</span> },
  { id: 'status', label: 'Estado', sortKey: 'status', defaultVisible: true, render: (o) => <OperationStatusBadge status={o.status} /> },
  { id: 'kind', label: 'Tipo', defaultVisible: false, render: (o) => o.kind },
  { id: 'transport', label: 'Transporte', defaultVisible: false, render: (o) => o.transport },
  { id: 'owner', label: 'Responsable', defaultVisible: true, className: 'whitespace-nowrap', render: (o) => o.owner },
  {
    id: 'route',
    label: 'Ruta',
    sortKey: 'origin',
    defaultVisible: true,
    className: 'max-w-[300px]',
    render: (o) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{o.origin}</span>
        <ChevronRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="truncate">{o.destination}</span>
      </span>
    ),
  },
  { id: 'origin', label: 'Origen', sortKey: 'origin', defaultVisible: false, className: 'max-w-[180px]', render: (o) => <span className="block truncate">{o.origin}</span> },
  { id: 'destination', label: 'Destino', sortKey: 'destination', defaultVisible: false, className: 'max-w-[180px]', render: (o) => <span className="block truncate">{o.destination}</span> },
  { id: 'etd', label: 'ETD', sortKey: 'etd', defaultVisible: true, className: 'tabular whitespace-nowrap', render: (o) => formatDate(o.etd) },
  { id: 'eta', label: 'ETA', sortKey: 'eta', defaultVisible: true, className: 'tabular whitespace-nowrap', render: (o) => formatDate(o.eta) },
  { id: 'atd', label: 'ATD', defaultVisible: false, className: 'tabular whitespace-nowrap', render: (o) => formatDate(o.atd) },
  { id: 'ata', label: 'ATA', defaultVisible: false, className: 'tabular whitespace-nowrap', render: (o) => formatDate(o.ata) },
  { id: 'ordenNumber', label: 'Nº orden', defaultVisible: false, className: 'font-mono', render: (o) => o.ordenNumber },
  { id: 'booking', label: 'Booking', defaultVisible: false, className: 'font-mono', render: (o) => o.booking },
  { id: 'freeDays', label: 'Días libres', defaultVisible: false, className: 'tabular', render: (o) => (o.freeDays == null ? '—' : `${o.freeDays} d`) },
  { id: 'documentClosingDate', label: 'Cierre documental', defaultVisible: false, className: 'tabular whitespace-nowrap', render: (o) => formatDate(o.documentClosingDate) },
]

const COLUMNS_KEY = 'logixtic.portal.operations-columns'
const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)

function readColumns(): ColumnId[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY)
    if (!raw) return DEFAULT_VISIBLE
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE
    const valid = parsed.filter((id): id is ColumnId => COLUMNS.some((c) => c.id === id))
    return valid.length ? valid : DEFAULT_VISIBLE
  } catch {
    return DEFAULT_VISIBLE
  }
}

function writeColumns(ids: ColumnId[]) {
  try {
    window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(ids))
  } catch {
    /* preferencia opcional */
  }
}

/* ------------------------------ Página ------------------------------ */

export function OperationsPage({ search }: { search: Record<string, string> }) {
  const { session, staff } = useSession()
  const activeStaff = useActiveStaffTenant()
  // Personal interno sin empresa de trabajo: la consulta no se lanza y la tabla explica la disponibilidad.
  const staffView = session === null && staff !== null
  const repo = useRepository()
  const navigate = useNavigate()
  const tenantId = session?.tenantId ?? ''
  const filters = useMemo(() => parseOperationSearch(search), [search])

  const query = useQuery({
    queryKey: tenantKey(tenantId, 'operations'),
    queryFn: () => repo.listOperations(tenantId),
    enabled: Boolean(tenantId),
  })

  const [visible, setVisible] = useState<ColumnId[]>(() => readColumns())
  const [showColumns, setShowColumns] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const setFilters = (next: OperationFilters) => {
    void navigate({ to: '/operaciones', search: toSearchParams(next), replace: true })
  }

  const toggleSort = (key: SortKey) => {
    if (filters.sort === key) {
      setFilters({ ...filters, dir: filters.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setFilters({ ...filters, sort: key, dir: 'asc' })
    }
  }

  const toggleColumn = (id: ColumnId) => {
    setVisible((prev) => {
      const willShow = !prev.includes(id)
      // Se conserva el orden canónico de columnas, sin importar el orden de los clics.
      const next = COLUMNS.filter((c) => (c.id === id ? willShow : prev.includes(c.id))).map((c) => c.id)
      writeColumns(next)
      return next
    })
  }

  const columns = COLUMNS.filter((c) => visible.includes(c.id))
  const results = useMemo(() => (query.data ? applyOperationFilters(query.data, filters) : []), [query.data, filters])
  const activeCount = countActiveFilters(filters)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Operación logística</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Operaciones</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {query.data
              ? `${results.length} de ${query.data.length} operaciones`
              : staffView
                ? 'Sin empresa de trabajo seleccionada'
                : 'Cargando operaciones…'}
          </p>
        </div>
      </header>

      {query.data && query.data.length > 0 && <OperationsSummary ops={query.data} />}
      {/* Personal interno sin empresa: las cifras no existen, se muestran como "—", nunca como cero. */}
      {staffView && <OperationsSummary ops={null} />}

      {/* Barra de filtros */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <label htmlFor="ops-q" className="sr-only">Buscar por DO, referencia, booking u orden</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              id="ops-q"
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Buscar DO, referencia, booking, orden, puerto…"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
            />
          </div>

          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className="lg:hidden">
            <Filter className="size-4" aria-hidden /> Filtros{activeCount > 0 && ` (${activeCount})`}
          </Button>

          <div className="relative">
            <Button variant="secondary" onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns} aria-haspopup="dialog">
              <Columns3 className="size-4" aria-hidden /> Columnas
            </Button>
            {showColumns && (
              <ColumnPicker visible={visible} onToggle={toggleColumn} onClose={() => setShowColumns(false)} />
            )}
          </div>
        </div>

        <div className={cn('mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-4 lg:items-end', showFilters ? 'grid' : 'hidden lg:grid')}>
          <fieldset className="min-w-0 lg:col-span-4">
            <legend className="mb-1.5 text-xs font-semibold text-ink-soft">Estado</legend>
            <div className="flex flex-wrap gap-1.5">
              {OPERATION_STATUSES.map((s) => {
                const active = filters.statuses.includes(s)
                const Icon = STATUS_META[s].icon
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        statuses: active ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s],
                      })
                    }
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-200',
                      active ? 'border-blue bg-blue text-white' : 'border-line-strong bg-surface text-ink-soft hover:border-blue hover:text-blue',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {s}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <SelectField id="ops-kind" label="Tipo de operación" value={filters.kind} onChange={(v) => setFilters({ ...filters, kind: v })} options={KIND_OPTIONS as readonly string[]} />
          <SelectField id="ops-transport" label="Transporte" value={filters.transport} onChange={(v) => setFilters({ ...filters, transport: v })} options={TRANSPORT_OPTIONS as readonly string[]} />

          <div className="grid grid-cols-2 gap-2">
            <DateField id="ops-from" label="Desde (ETD)" value={filters.from} onChange={(v) => setFilters({ ...filters, from: v })} />
            <DateField id="ops-to" label="Hasta (ETD)" value={filters.to} onChange={(v) => setFilters({ ...filters, to: v })} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex h-10 items-center gap-2 text-sm font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={filters.pendingOnly}
                onChange={(e) => setFilters({ ...filters, pendingOnly: e.target.checked })}
                className="size-4 rounded border-line-strong accent-blue"
              />
              Solo requieren mi respuesta
            </label>
            <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir })}>
              <X className="size-4" aria-hidden /> Limpiar filtros
            </Button>
          </div>
        </div>
      </Card>

      {query.isError && <Card><ErrorState message={query.error instanceof Error ? query.error.message : 'Error desconocido.'} onRetry={() => void query.refetch()} /></Card>}

      {query.isPending && (staffView ? <Card><StaffModuleNotice noun="operaciones" hasContext={Boolean(activeStaff)} /></Card> : <LoadingTable />)}

      {query.data && query.data.length === 0 && (
        <Card>
          <EmptyState icon={<Package className="size-6" />} title="Aún no hay operaciones" description="Cuando su equipo de Logixtic registre una operación, aparecerá aquí." />
        </Card>
      )}

      {query.data && query.data.length > 0 && results.length === 0 && (
        <Card>
          <EmptyState
            icon={<Search className="size-6" />}
            title="Ninguna operación coincide con los filtros"
            description="Pruebe con otro término o quite algún filtro."
            action={<Button variant="secondary" size="sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Quitar todos los filtros</Button>}
          />
        </Card>
      )}

      {results.length > 0 && (
        <>
          {/* Tabla en escritorio */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-surface-muted/70 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.id} scope="col" className="px-4 py-3 whitespace-nowrap" aria-sort={c.sortKey && filters.sort === c.sortKey ? (filters.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {c.sortKey ? (
                          <button type="button" onClick={() => toggleSort(c.sortKey!)} className="inline-flex items-center gap-1 hover:text-ink">
                            {c.label}
                            <SortIcon active={filters.sort === c.sortKey} dir={filters.dir} />
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                    <th scope="col" className="relative w-10"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((op) => (
                    <tr
                      key={op.id}
                      onClick={() => void navigate({ to: '/operaciones/$operationId', params: { operationId: op.id } })}
                      className="group cursor-pointer transition-colors duration-150 hover:bg-blue-50/50"
                    >
                      {columns.map((c, i) => (
                        <td key={c.id} className={cn('px-4 py-3 align-middle text-ink-soft', c.className)}>
                          {i === 0 ? (
                            <Link to="/operaciones/$operationId" params={{ operationId: op.id }} onClick={(e) => e.stopPropagation()} className="rounded text-blue hover:underline">
                              {c.render(op)}
                            </Link>
                          ) : (
                            c.render(op)
                          )}
                        </td>
                      ))}
                      <td className="px-3 text-ink-muted">
                        <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Tarjetas en móvil */}
          <ul className="flex flex-col gap-3 md:hidden">
            {results.map((op) => (
              <li key={op.id}>
                <OperationCard op={op} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function OperationCard({ op }: { op: Operation }) {
  const etaDays = op.eta && !op.ata ? daysUntil(op.eta) : null
  return (
    <Link
      to="/operaciones/$operationId"
      params={{ operationId: op.id }}
      className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-colors duration-200 active:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-blue">{op.doNumber}</p>
          <p className="mt-0.5 truncate text-sm font-medium text-ink">{op.reference}</p>
        </div>
        <OperationStatusBadge status={op.status} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
        <span className="truncate">{op.origin}</span>
        <ChevronRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="truncate">{op.destination}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted tabular">
        <span>{op.kind} · {op.transport}</span>
        <span>ETD {formatDate(op.etd)}</span>
        <span>ETA {formatDate(op.eta)}</span>
        {etaDays !== null && etaDays >= 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{etaDays} d</span>}
        {op.pendingClientResponse && <span className="font-semibold text-danger-700">Requiere su respuesta</span>}
      </div>
    </Link>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
  return dir === 'asc' ? <ArrowUp className="size-3.5 text-blue" aria-hidden /> : <ArrowDown className="size-3.5 text-blue" aria-hidden />
}

function ColumnPicker({ visible, onToggle, onClose }: { visible: ColumnId[]; onToggle: (id: ColumnId) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} role="dialog" aria-label="Mostrar u ocultar columnas" className="absolute right-0 z-30 mt-2 w-64 animate-slide-up rounded-xl border border-line bg-surface p-2 shadow-pop">
      <p className="px-2 pt-1 pb-2 text-xs font-semibold text-ink-muted uppercase">Columnas visibles</p>
      <ul className="max-h-80 overflow-y-auto">
        {COLUMNS.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted">
              <input type="checkbox" checked={visible.includes(c.id)} onChange={() => onToggle(c.id)} className="size-4 accent-blue" />
              {c.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-soft">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15">
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-soft">{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-2.5 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15" />
    </div>
  )
}

/** Franja de resumen sobre el total de operaciones (no depende de los filtros). */
function OperationsSummary({ ops }: { ops: Operation[] | null }) {
  // Mismos agregados que la Torre (features/operations/aggregates.ts). Sin datos cargados se muestra «—», nunca 0.
  const agg = ops === null ? null : operationAggregates(ops)
  const none = agg === null
  const pendingNone = agg === null || !agg.responseKnown
  const items = [
    { label: 'Activas', value: none ? '—' : agg.active, tone: 'text-blue' },
    { label: 'En movimiento', value: none ? '—' : agg.inMotion, tone: 'text-navy-700' },
    { label: 'Requieren su respuesta', value: pendingNone ? '—' : agg.pending, tone: !pendingNone && agg.pending > 0 ? 'text-danger-700' : 'text-ink' },
    { label: 'Total registradas', value: none ? '—' : agg.total, tone: 'text-ink' },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de operaciones">
      {items.map((it) => (
        <div key={it.label} className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-card">
          <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{it.label}</dt>
          <dd className={cn('mt-1 text-2xl font-bold tracking-tight tabular', it.tone)}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function LoadingTable() {
  return (
    <Card className="p-4" aria-busy="true" aria-label="Cargando operaciones">
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </Card>
  )
}
