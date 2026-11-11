/**
 * Cotizaciones: listado (/cotizaciones) y detalle con decisión (/cotizaciones/:id).
 *
 * Responsabilidad: mostrar conceptos, condiciones y observaciones; permitir aceptar o rechazar solo si
 * canDecideQuote lo permite y FEATURES.quoteDecisions está activa.
 * Flujo de decisión: confirmación explícita, llamada al repositorio y actualización de las consultas
 * del tenant. En desarrollo la decisión se registra en el repositorio local y no genera transacción comercial.
 * Errores: si el repositorio rechaza la decisión (estado o vigencia), se muestra el motivo.
 */
import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileText, Info, SearchX, X } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useToast } from '@/components/ui/toast'
import { Badge, Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton, type Tone } from '@/components/ui/primitives'
import { cn, formatDate, formatMoney, formatNumber, daysUntil } from '@/lib/format'
import type { Quote, QuoteStatus } from '@/types/domain'
import { referenceNow } from '@/lib/clock'
import { FEATURES } from '@/config/runtime'
import { canDecideQuote, effectiveQuoteStatus, quoteSubtotal } from './quote-rules'

const QUOTE_TONE: Record<QuoteStatus, Tone> = {
  Pendiente: 'info',
  Aceptada: 'success',
  Rechazada: 'neutral',
  Vencida: 'warning',
}

export function QuotesListPage() {
  const repo = useRepository()
  const { session } = useSession()
  const tenantId = session?.tenantId ?? ''
  const now = useMemo(() => referenceNow(), [])
  const quotes = useQuery({ queryKey: tenantKey(tenantId, 'quotes'), queryFn: () => repo.listQuotes(tenantId), enabled: Boolean(tenantId) })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Comercial</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Cotizaciones</h1>
        <p className="mt-1 text-sm text-ink-muted">Revise conceptos, vigencias y decida cuando el estado lo permita.</p>
      </header>

      {quotes.isError && <Card><ErrorState message="No se pudieron cargar las cotizaciones." onRetry={() => void quotes.refetch()} /></Card>}

      {quotes.isPending && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
      )}

      {quotes.data && quotes.data.length === 0 && (
        <Card><EmptyState icon={<FileText className="size-6" />} title="Sin cotizaciones" description="Cuando Logixtic emita una cotización para su empresa, aparecerá aquí." /></Card>
      )}

      {quotes.data && quotes.data.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {[...quotes.data].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((q) => {
            const status = effectiveQuoteStatus(q, now)
            const days = daysUntil(q.validUntil, now)
            return (
              <li key={q.id}>
                <Link to="/cotizaciones/$quoteId" params={{ quoteId: q.id }} className="group block h-full rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-blue/40 hover:shadow-pop">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-blue">{q.number} · v{q.version}</p>
                      <p className="mt-1 font-semibold text-ink">{q.service}</p>
                    </div>
                    <Badge tone={QUOTE_TONE[status]}>{status}</Badge>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                    <span className="truncate">{q.origin}</span><ArrowRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden /><span className="truncate">{q.destination}</span>
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-ink-muted">Valor total</p>
                      <p className="text-xl font-bold text-ink tabular">{formatMoney(quoteSubtotal(q), q.currency)}</p>
                    </div>
                    <p className={cn('text-right text-xs tabular', days < 0 ? 'text-danger-700' : 'text-ink-muted')}>
                      {days < 0 ? 'Vencida' : `Vigente hasta ${formatDate(q.validUntil)}`}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function QuoteDetailPage({ quoteId }: { quoteId: string }) {
  const repo = useRepository()
  const { session } = useSession()
  const tenantId = session?.tenantId ?? ''
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const now = useMemo(() => referenceNow(), [])
  const [confirming, setConfirming] = useState<'Aceptada' | 'Rechazada' | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const quote = useQuery({
    queryKey: tenantKey(tenantId, 'quote', quoteId),
    queryFn: () => repo.getQuote(tenantId, quoteId),
    enabled: Boolean(tenantId),
  })

  if (quote.isPending) {
    return <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>
  }
  if (quote.isError) return <Card><ErrorState message="No se pudo cargar la cotización." onRetry={() => void quote.refetch()} /></Card>
  if (!quote.data) {
    return (
      <Card>
        <EmptyState icon={<SearchX className="size-6" />} title="Cotización no encontrada" description="No existe una cotización con ese identificador en su empresa." action={<Link to="/cotizaciones" className="text-sm font-semibold text-blue hover:underline">Volver a cotizaciones</Link>} />
      </Card>
    )
  }

  const q: Quote = quote.data
  const status = effectiveQuoteStatus(q, now)
  const decision = canDecideQuote(q, now)
  const subtotal = quoteSubtotal(q)

  const decide = async (value: 'Aceptada' | 'Rechazada') => {
    setBusy(true)
    setActionError(null)
    try {
      await repo.decideQuote(tenantId, q.id, value)
      await queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'quote', quoteId) })
      await queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'quotes') })
      toast({ title: value === 'Aceptada' ? 'Cotización aceptada' : 'Cotización rechazada', description: `${q.number} · decisión registrada en el entorno local. No genera una transacción comercial.`, tone: value === 'Aceptada' ? 'success' : 'info' })
      setConfirming(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo registrar la decisión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Volver">
        <Link to="/cotizaciones" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-blue">
          <ArrowLeft className="size-4" aria-hidden /> Cotizaciones
        </Link>
      </nav>

      <section className="relative overflow-hidden rounded-[18px] bg-midnight p-6 text-white shadow-pop sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold tracking-wide text-cyan">{q.number} · versión {q.version}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{q.service}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/70">
              {q.origin} <ArrowRight className="size-3.5" aria-hidden /> {q.destination}
            </p>
          </div>
          <div className="text-left md:text-right">
            <Badge tone={QUOTE_TONE[status]}>{status}</Badge>
            <p className="mt-3 text-xs text-white/55">Valor total</p>
            <p className="text-3xl font-extrabold tabular">{formatMoney(subtotal, q.currency)}</p>
          </div>
        </div>
        <dl className="relative mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
          <div><dt className="text-white/55">Emitida</dt><dd className="font-semibold tabular">{formatDate(q.issuedAt)}</dd></div>
          <div><dt className="text-white/55">Vigente hasta</dt><dd className="font-semibold tabular">{formatDate(q.validUntil)}</dd></div>
          <div><dt className="text-white/55">Moneda</dt><dd className="font-semibold">{q.currency}</dd></div>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="p-5 sm:p-6">
            <SectionHeading title="Detalle de conceptos" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Conceptos de la cotización {q.number}</caption>
              <thead className="bg-surface-muted/70 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">Concepto</th>
                  <th scope="col" className="px-3 py-3 text-right">Cantidad</th>
                  <th scope="col" className="px-3 py-3">Unidad</th>
                  <th scope="col" className="px-3 py-3 text-right">Valor unitario</th>
                  <th scope="col" className="px-5 py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 font-medium text-ink">{l.concept}</td>
                    <td className="px-3 py-3 text-right tabular">{formatNumber(l.quantity, 2)}</td>
                    <td className="px-3 py-3 text-ink-soft">{l.unit}</td>
                    <td className="px-3 py-3 text-right tabular">{formatMoney(l.unitPrice, q.currency)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular">{formatMoney(l.quantity * l.unitPrice, q.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <th scope="row" colSpan={4} className="px-5 py-4 text-right text-sm font-semibold text-ink-soft">Total</th>
                  <td className="px-5 py-4 text-right text-base font-bold text-ink tabular">{formatMoney(subtotal, q.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <SectionHeading title="Decisión" />
            {confirming ? (
              <div className="flex flex-col gap-3 animate-fade-in" role="group" aria-label="Confirmar decisión">
                <p className="text-sm text-ink-soft">
                  ¿Confirma que desea <strong className="text-ink">{confirming === 'Aceptada' ? 'aceptar' : 'rechazar'}</strong> la cotización {q.number}?
                </p>
                <p className="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />La decisión se registra en el entorno local y no genera una transacción comercial.</p>
                <div className="flex gap-2">
                  <Button variant={confirming === 'Aceptada' ? 'primary' : 'danger'} loading={busy} onClick={() => void decide(confirming)} className="flex-1">
                    {confirming === 'Aceptada' ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />} Confirmar
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>Volver</Button>
                </div>
              </div>
            ) : decision.allowed && FEATURES.quoteDecisions ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-soft">Esta cotización está vigente y puede decidirse.</p>
                <div className="flex gap-2">
                  <Button variant="accent" className="flex-1 !bg-success !text-white hover:!bg-success/90" onClick={() => setConfirming('Aceptada')}><Check className="size-4" aria-hidden /> Aceptar</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirming('Rechazada')}><X className="size-4" aria-hidden /> Rechazar</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="flex items-start gap-2 text-sm text-ink-soft"><CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />{decision.allowed ? 'Para decidir sobre esta cotización, contacta a tu ejecutivo de cuenta.' : decision.reason}</p>
              </div>
            )}
            {actionError && <p role="alert" className="mt-3 text-sm text-danger-700">{actionError}</p>}
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionHeading title="Condiciones y observaciones" />
            <dl className="space-y-4 text-sm">
              <div><dt className="text-xs font-semibold text-ink-muted uppercase">Condiciones</dt><dd className="mt-1 text-ink-soft">{q.conditions || '—'}</dd></div>
              <div><dt className="text-xs font-semibold text-ink-muted uppercase">Observaciones</dt><dd className="mt-1 text-ink-soft">{q.observations || '—'}</dd></div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  )
}
