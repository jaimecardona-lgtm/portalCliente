import type { Currency } from '@/types/domain'

const LOCALE = 'es-CO'
const TIME_ZONE = 'America/Bogota'

/** Une clases condicionales descartando valores falsy. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * "2026-11-24" → "24 nov 2026". Nulos se muestran como guion.
 * Las fechas de solo día se representan a medianoche UTC y se formatean en UTC:
 * formatearlas en otra zona horaria mostraría el día anterior.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseDateOnly(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

/** Día calendario de Bogotá para un instante, como medianoche UTC (para comparar fechas de solo día). */
export function bogotaDayUTC(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIME_ZONE }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

/** ISO con hora → "11 nov 2026, 14:20". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

/** Fecha relativa corta: "hace 3 h", "hace 2 d", "en 5 d". */
export function formatRelative(value: string, now: Date = new Date()): string {
  const diffMs = new Date(value).getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const minutes = Math.round(abs / 60000)
  const suffix = diffMs < 0 ? 'hace' : 'en'
  if (minutes < 60) return diffMs < 0 ? `hace ${Math.max(minutes, 1)} min` : `en ${Math.max(minutes, 1)} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${suffix} ${hours} h`
  const days = Math.round(hours / 24)
  return `${suffix} ${days} d`
}

/** Días entre hoy y una fecha (negativo si ya pasó). Usa solo la parte de fecha. */
export function daysUntil(dateOnly: string, now: Date = new Date()): number {
  const target = parseDateOnly(dateOnly)
  if (!target) return 0
  const ms = target.getTime() - bogotaDayUTC(now).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(amount)
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value)
}

/** Interpreta "YYYY-MM-DD" como fecha UTC a medianoche para comparaciones estables. */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
}

export { parseDateOnly }
