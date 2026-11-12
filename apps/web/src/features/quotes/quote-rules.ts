/**
 * Reglas de negocio de las cotizaciones en el cliente.
 *
 * canDecideQuote: una cotización solo admite decisión si está Pendiente y su vigencia no ha vencido.
 * La regla se muestra al usuario; el servidor (FastAPI) debe validarla de nuevo al registrar la decisión.
 * quoteSubtotal: suma cantidad por valor unitario de cada concepto, sin impuestos ni redondeo adicional.
 * effectiveQuoteStatus: una pendiente con vigencia vencida se presenta como Vencida, sin modificar el dato.
 * Dependencia de fechas: usa la referencia temporal de la aplicación (daysUntil).
 */
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
