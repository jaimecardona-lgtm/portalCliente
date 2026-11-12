import { useState, type ReactNode } from 'react'
import { ChevronDown, FileText, Info, AlertTriangle, ArrowRight, Paperclip, MessageSquare, RefreshCcw, type LucideIcon } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/format'
import type { EventType, ID, OperationStatus } from '@/types/domain'
import { Badge, type Tone } from '@/components/ui/primitives'
import { OperationStatusBadge } from '@/components/ui/status-badge'

/**
 * Timeline vertical reutilizable. No conoce dominio de operaciones:
 * recibe ítems normalizados y un render prop para la conversación de cada evento.
 */
export interface TimelineAttachment {
  id: ID
  name: string
  sizeKb: number
}

export interface TimelineItem {
  id: ID
  type: EventType
  occurredAt: string
  title: string
  description: string
  author: string
  fromStatus: OperationStatus | null
  toStatus: OperationStatus | null
  attachments: TimelineAttachment[]
  /** Número de comentarios del hilo (sin cargarlo). Opcional. */
  commentCount?: number
}

interface EventMeta {
  label: string
  tone: Tone
  icon: LucideIcon
  /** Color del punto central del marcador. */
  dot: string
  /** Halo del marcador. */
  ring: string
}

const EVENT_META: Record<EventType, EventMeta> = {
  status_change: { label: 'Cambio de estado', tone: 'info', icon: RefreshCcw, dot: 'bg-blue', ring: 'ring-blue/20' },
  news: { label: 'Novedad', tone: 'neutral', icon: Info, dot: 'bg-ink-soft', ring: 'ring-ink-soft/20' },
  document: { label: 'Documento', tone: 'brand', icon: FileText, dot: 'bg-blue', ring: 'ring-blue/25' },
  action_required: { label: 'Acción requerida', tone: 'danger', icon: AlertTriangle, dot: 'bg-danger', ring: 'ring-danger/25' },
}

export function EventTimeline({
  items,
  renderConversation,
  ariaLabel = 'Línea de tiempo de la operación',
  emptyState,
}: {
  items: TimelineItem[]
  renderConversation: (item: TimelineItem) => ReactNode
  ariaLabel?: string
  emptyState?: ReactNode
}) {
  if (items.length === 0) return <>{emptyState ?? <p className="text-sm text-ink-muted">Sin eventos registrados.</p>}</>

  return (
    <ol aria-label={ariaLabel} className="relative flex flex-col gap-4">
      {items.map((item, index) => (
        <TimelineEntry
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
          renderConversation={renderConversation}
          defaultOpen={item.type === 'action_required'}
        />
      ))}
    </ol>
  )
}

function TimelineEntry({
  item,
  isLast,
  renderConversation,
  defaultOpen,
}: {
  item: TimelineItem
  isLast: boolean
  renderConversation: (item: TimelineItem) => ReactNode
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = EVENT_META[item.type]
  const Icon = meta.icon
  const panelId = `event-panel-${item.id}`
  const isAction = item.type === 'action_required'

  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
      {/* Carril vertical */}
      <div className="relative flex flex-col items-center" aria-hidden>
        <span className={cn('z-10 mt-4 grid size-7 place-items-center rounded-full bg-surface ring-4', meta.ring)}>
          <span className={cn('size-2.5 rounded-full', meta.dot)} />
        </span>
        {!isLast && <span className="-mb-4 w-px flex-1 bg-gradient-to-b from-line-strong to-line" />}
      </div>

      <article
        id={`evento-${item.id}`}
        className={cn(
          'min-w-0 rounded-[var(--radius-card)] border bg-surface shadow-card transition-[box-shadow,border-color] duration-200',
          isAction ? 'border-danger/30' : 'border-line',
          open && 'shadow-pop',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-3 rounded-[var(--radius-card)] p-4 text-left transition-colors duration-200 hover:bg-surface-muted/50"
        >
          <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', isAction ? 'bg-danger-50 text-danger-700' : 'bg-surface-muted text-ink-soft')}>
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <time dateTime={item.occurredAt} className="text-xs text-ink-muted tabular">{formatDateTime(item.occurredAt)}</time>
            </span>
            <span className="mt-1.5 block font-semibold text-ink">{item.title}</span>
            {item.fromStatus && item.toStatus && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                <span>{item.fromStatus}</span>
                <ArrowRight className="size-3" aria-hidden />
                <OperationStatusBadge status={item.toStatus} className="!px-2 !py-0 !text-[11px]" />
              </span>
            )}
            {!item.fromStatus && item.toStatus && (
              <span className="mt-1.5 block">
                <OperationStatusBadge status={item.toStatus} className="!px-2 !py-0 !text-[11px]" />
              </span>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-muted">
            <span className="hidden text-right sm:block">{item.author}</span>
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden />
              <span className="tabular">{item.commentCount ?? 0}</span>
            </span>
          </span>
          <ChevronDown className={cn('mt-1 size-4 shrink-0 text-ink-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </button>

        <div
          id={panelId}
          hidden={!open}
          className={cn('border-t border-line px-4 pt-4 pb-4', open && 'animate-fade-in')}
        >
          <p className="text-sm text-ink-soft">{item.description}</p>
          <p className="mt-2 text-xs text-ink-muted">Autor: <span className="font-medium text-ink-soft">{item.author}</span></p>

          {item.attachments.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Adjuntos del evento">
              {item.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-soft">
                  <Paperclip className="size-3.5 text-ink-muted" aria-hidden />
                  <span className="max-w-[220px] truncate">{a.name}</span>
                  <span className="text-ink-muted tabular">{a.sizeKb} KB</span>
                </li>
              ))}
            </ul>
          )}

          {renderConversation(item)}
        </div>
      </article>
    </li>
  )
}
