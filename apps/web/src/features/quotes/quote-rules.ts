import type { Quote, QuoteStatus } from '@/types/domain'
import { daysUntil } from '@/lib/format'

/**
 * Una cotización solo admite decisión si está Pendiente y su vigencia no ha expirado.
 * Regla de presentación: la validación definitiva la hará FastAPI.
 */
export function canDecideQuote(quote: Quote, now: Date): { allowed: boolean; reason: string | null } {
  if (quote.status !== 'Pendiente') {
    return { allowed: false, reason: `La cotización está en estado "${quote.status}" y no admite decisiones.` }
  }
  if (daysUntil(quote.validUntil, now) < 0) {
    return { allowed: false, reason: 'La vigencia de la cotización ya venció. Solicite una nueva versión.' }
  }
  return { allowed: true, reason: null }
}

export function quoteSubtotal(quote: Quote): number {
  return quote.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
}

/** Estado mostrado: una pendiente con vigencia vencida se presenta como Vencida. */
export function effectiveQuoteStatus(quote: Quote, now: Date): QuoteStatus {
  if (quote.status === 'Pendiente' && daysUntil(quote.validUntil, now) < 0) return 'Vencida'
  return quote.status
}
