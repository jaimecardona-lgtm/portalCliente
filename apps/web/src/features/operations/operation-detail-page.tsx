/**
 * Detalle de una operación (DO) (/operaciones/:id).
 *
 * Responsabilidad: cabecera con número DO, ruta, progreso, fechas logísticas y responsable; timeline de
 * eventos con sus conversaciones; datos logísticos y documentos vinculados a eventos.
 * Aislamiento: la operación se busca siempre por el tenant de la sesión. Un identificador de otra empresa
 * devuelve "no encontrada" sin revelar que existe.
 * Dependencias: repositorio (getOperation, listOperationEvents, listAttachments, listEventComments),
 * EventTimeline (componente genérico) y EventThread (conversaciones).
 * Decisión no evidente: el progreso usa milestoneIndex, que agrupa "En puerto" y "En aduana" en un mismo hito.
 */
import { useMemo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Calendar, Plane, Ship, Truck, Anchor, FileSearch, SearchX, Paperclip, UserRound, Ticket, AlertTriangle } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { Card, EmptyState, ErrorState, SectionHeading, Skeleton, Badge } from '@/components/ui/primitives'
import { OperationStatusBadge } from '@/components/ui/status-badge'
import { EventTimeline, type TimelineItem } from '@/components/timeline/event-timeline'
import { formatDate, daysUntil, cn } from '@/lib/format'
import type { Operation, OperationEvent, TransportType } from '@/types/domain'
import { STATUS_META } from './status'
import { EventThread } from './event-thread'
import { countThread, buildThread, isVisibleToClient } from './thread-utils'

const TRANSPORT_ICON: Record<TransportType, typeof Ship> = {
  'Marítimo FCL': Ship,
  'Marítimo LCL': Ship,
  Aéreo: Plane,
  Terrestre: Truck,
}

export function OperationDetailPage({ operationId }: { operationId: string }) {
  const repo = useRepository()
  const { session } = useSession()
  const tenantId = session?.tenantId ?? ''

  // El acceso siempre se valida contra el tenant de la sesión: un ID de otra empresa devuelve null.
  const opQuery = useQuery({
    queryKey: tenantKey(tenantId, 'operation', operationId),
    queryFn: () => repo.getOperation(tenantId, operationId),
    enabled: Boolean(tenantId),
  })
  const eventsQuery = useQuery({
    queryKey: tenantKey(tenantId, 'events', operationId),
    queryFn: () => repo.listOperationEvents(tenantId, operationId),
    enabled: Boolean(tenantId),
  })
  const attachmentsQuery = useQuery({
    queryKey: tenantKey(tenantId, 'attachments'),
    queryFn: () => repo.listAttachments(tenantId),
    enabled: Boolean(tenantId),
  })

  const visibleEvents = useMemo<OperationEvent[]>(
    () => (eventsQuery.data ?? []).filter((e) => isVisibleToClient(e.visibility)),
    [eventsQuery.data],
  )

  // Conteo de mensajes por evento (cada hilo es independiente).
  const commentQueries = useQueries({
    queries: visibleEvents.map((e) => ({
      queryKey: tenantKey(tenantId, 'comments', operationId, e.id),
      queryFn: () => repo.listEventComments(tenantId, operationId, e.id),
      enabled: Boolean(tenantId),
    })),
  })

  if (opQuery.isPending || eventsQuery.isPending) return <DetailSkeleton />

  if (opQuery.isError || eventsQuery.isError) {
    return (
      <Card>
        <ErrorState message="No fue posible cargar la operación. Intente nuevamente." onRetry={() => void opQuery.refetch()} />
      </Card>
    )
  }

  const op = opQuery.data
  if (!op) {
    return (
      <Card>
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Operación no encontrada"
          description="El número o enlace no corresponde a una operación de su empresa."
          action={<Link to="/operaciones" className="text-sm font-semibold text-blue hover:underline">Volver a operaciones</Link>}
        />
      </Card>
    )
  }

  const attachmentsById = new Map((attachmentsQuery.data ?? []).map((a) => [a.id, a]))
  const commentCountByEvent = new Map(
    visibleEvents.map((e, i) => [e.id, countThread(buildThread(commentQueries[i]?.data ?? [], e.id))]),
  )

  const timelineItems: TimelineItem[] = visibleEvents.map((e) => ({
    id: e.id,
    type: e.type,
    occurredAt: e.occurredAt,
    title: e.title,
    description: e.description,
    author: e.author,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    attachments: e.attachmentIds
      .map((id) => attachmentsById.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ id: a.id, name: a.name, sizeKb: a.sizeKb })),
    commentCount: commentCountByEvent.get(e.id) ?? 0,
  }))

  const relatedDocs = [...new Map(
    visibleEvents.flatMap((e) => e.attachmentIds).map((id) => [id, attachmentsById.get(id)]),
  ).values()].filter((a): a is NonNullable<typeof a> => Boolean(a))

  const actionEvents = visibleEvents.filter((e) => e.type === 'action_required')
  const TransportIcon = TRANSPORT_ICON[op.transport]

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Volver">
        <Link to="/operaciones" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-blue">
          <ArrowLeft className="size-4" aria-hidden /> Operaciones
        </Link>
      </nav>

      <OperationHero op={op} TransportIcon={TransportIcon} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Protagonista: timeline + conversaciones */}
        <section aria-labelledby="timeline-title" className="min-w-0">
          <SectionHeading id="timeline-title" title="Seguimiento e historial" description="Cada evento tiene su propia conversación. Los mensajes no cambian el estado de la operación." />
          <EventTimeline
            items={timelineItems}
            ariaLabel={`Línea de tiempo de ${op.doNumber}`}
            renderConversation={(item) => (
              <EventThread operationId={op.id} eventId={item.id} label={item.title} />
            )}
          />
        </section>

        {/* Columna de contexto */}
        <aside className="flex min-w-0 flex-col gap-5" aria-label="Información complementaria">
          {actionEvents.length > 0 && (
            <Card className="border-danger/30 bg-danger-50/40 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                <AlertTriangle className="size-4" aria-hidden /> {actionEvents.length} acción(es) requerida(s)
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
                {actionEvents.map((e) => (
                  <li key={e.id}>
                    <a href={`#evento-${e.id}`} className="font-medium text-ink hover:underline">{e.title}</a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <SectionHeading title="Datos logísticos" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <DataItem label="Orden de compra" value={op.ordenNumber} mono />
              <DataItem label="Booking / AWB" value={op.booking} mono />
              <DataItem label="Responsable" value={op.owner} icon={<UserRound className="size-3.5" aria-hidden />} />
              <DataItem label="Tipo" value={`${op.kind} · ${op.transport}`} />
              <DataItem label="Días libres" value={op.freeDays == null ? '—' : `${op.freeDays} días`} />
              <DataItem label="Cierre documental" value={formatDate(op.documentClosingDate)} />
              <DataItem label="Creada" value={formatDate(op.createdAt)} />
              <DataItem label="Última actualización" value={formatDate(op.updatedAt)} />
            </dl>
          </Card>

          <Card className="p-5">
            <SectionHeading title="Documentos relacionados" description={`${relatedDocs.length} archivo(s) vinculados a eventos`} />
            {relatedDocs.length === 0 ? (
              <EmptyState icon={<FileSearch className="size-5" />} title="Sin documentos vinculados" description="Los documentos aparecerán aquí cuando se asocien a un evento." />
            ) : (
              <ul className="flex flex-col gap-2">
                {relatedDocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5">
                    <Paperclip className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{d.name}</span>
                      <span className="text-xs text-ink-muted tabular">{d.sizeKb} KB · {formatDate(d.uploadedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

function OperationHero({ op, TransportIcon }: { op: Operation; TransportIcon: typeof Ship }) {
  const meta = STATUS_META[op.status]
  // Estados → hitos: Creado=0, En tránsito=1, En puerto/aduana=2, Entregado=3, Cerrado=4.
  const stepIndex = milestoneIndex(meta.step)
  const milestones = ['Creado', 'En tránsito', 'En puerto / aduana', 'Entregado', 'Cerrado']
  const etaDays = op.eta && !op.ata ? daysUntil(op.eta) : null

  return (
    <section aria-labelledby="op-title" className="relative overflow-hidden rounded-[18px] bg-midnight text-white shadow-pop">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(900px 300px at 85% -10%, rgba(34,199,242,0.22), transparent 60%), radial-gradient(600px 260px at -5% 110%, rgba(37,99,235,0.28), transparent 60%)' }} />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-blue uppercase">Número DO</p>
          </div>
          <h1 id="op-title" className="mt-1 font-mono text-3xl font-extrabold tracking-tight sm:text-4xl">{op.doNumber}</h1>
          <p className="mt-1 truncate text-sm text-white/65">{op.reference}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <OperationStatusBadge status={op.status} className="!bg-white/10 !text-white !ring-white/20" />
            <Badge tone="neutral" className="!bg-white/10 !text-white/80 !ring-white/15" icon={<TransportIcon className="size-3.5" aria-hidden />}>{op.transport}</Badge>
            <Badge tone="neutral" className="!bg-white/10 !text-white/80 !ring-white/15">{op.kind}</Badge>
            {op.pendingClientResponse && <Badge tone="danger" className="!bg-danger/20 !text-white/85 !ring-warning-200/30">Requiere su respuesta</Badge>}
          </div>

          {/* Ruta */}
          <div className="mt-6 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] tracking-wide text-white/50 uppercase">Origen</p>
              <p className="truncate font-semibold">{op.origin}</p>
            </div>
            <div className="relative flex min-w-[60px] flex-1 items-center" aria-hidden>
              <span className="h-px w-full border-t border-dashed border-white/30" />
              <span className="absolute left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full bg-midnight text-blue ring-1 ring-white/25">
                <TransportIcon className="size-4" />
              </span>
              <span className="absolute right-0 grid size-6 place-items-center rounded-full bg-blue text-midnight">
                <ArrowRight className="size-3.5" />
              </span>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[11px] tracking-wide text-white/50 uppercase">Destino</p>
              <p className="truncate font-semibold">{op.destination}</p>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          {/* Progreso */}
          <div>
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Progreso</span>
              {etaDays !== null && etaDays >= 0 && <span className="tabular">ETA en {etaDays} d</span>}
            </div>
            <ol className="mt-2 grid grid-cols-5 gap-1.5" aria-label={`Progreso: ${op.status}`}>
              {milestones.map((label, i) => {
                const done = i <= stepIndex
                const current = i === stepIndex
                return (
                  <li key={label} className="min-w-0">
                    <span className={cn('block h-1.5 rounded-full transition-colors duration-200', done ? (current ? 'bg-blue' : 'bg-blue') : 'bg-white/15')} />
                    <span className={cn('mt-1.5 block text-[10px] leading-tight sm:text-[11px]', current ? 'font-semibold text-white' : 'text-white/45')}>{label}</span>
                  </li>
                )
              })}
            </ol>
            {op.status === 'Pendiente cliente' && <p className="mt-2 text-xs text-white/85">La operación está en espera de su respuesta.</p>}
          </div>

          {/* Fechas */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DateTile label="ETD" value={op.etd} />
            <DateTile label="ATD" value={op.atd} />
            <DateTile label="ETA" value={op.eta} />
            <DateTile label="ATA" value={op.ata} />
          </dl>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-sm">
            <span className="flex items-center gap-2 text-white/75"><UserRound className="size-4 text-white/50" aria-hidden />{op.owner}</span>
            <span className="flex items-center gap-2 text-white/75"><Ticket className="size-4 text-white/50" aria-hidden /><span className="font-mono">{op.booking}</span></span>
            <span className="flex items-center gap-2 text-white/75"><Anchor className="size-4 text-white/50" aria-hidden /><span className="font-mono">{op.ordenNumber}</span></span>
            <span className="flex items-center gap-2 text-white/75"><Calendar className="size-4 text-white/50" aria-hidden />Actualizada {formatDate(op.updatedAt)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function milestoneIndex(step: number): number {
  if (step <= 2) return step
  if (step === 3) return 2
  return Math.min(step - 1, 4)
}

function DateTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/50 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular">{formatDate(value)}</dd>
    </div>
  )
}

function DataItem({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className={cn('mt-0.5 flex min-w-0 items-center gap-1.5 break-words font-medium text-ink', mono && 'font-mono text-[13px]')}>
        {icon}
        {value}
      </dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando operación">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-64 w-full rounded-[18px]" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}
