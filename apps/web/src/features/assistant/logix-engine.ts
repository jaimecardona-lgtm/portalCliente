import type { DocumentRecord, Operation, Quote } from '@/types/domain'
import { daysUntil, formatDate, formatMoney } from '@/lib/format'

/**
 * Motor DEMO de Logix. NO usa ningún LLM.
 * Responde solo con datos del tenant activo que se le pasan.
 * Cuando exista el servicio FastAPI, esta función se reemplaza por una llamada al backend
 * que aplique las mismas restricciones de tenant y permisos.
 */

export interface LogixData {
  operations: Operation[]
  documents: DocumentRecord[]
  quotes: Quote[]
}

export interface LogixAnswer {
  text: string
  /** DO referenciados en la respuesta (para enlazar). */
  operationIds?: string[]
  /** true cuando no hay información disponible en los datos autorizados. */
  unavailable?: boolean
}

export const SUGGESTED_QUESTIONS = [
  '¿Cuántas operaciones activas tengo?',
  '¿Qué operaciones esperan mi respuesta?',
  '¿Qué documentos están vencidos o por vencer?',
  '¿Qué cotizaciones están pendientes?',
]

const ACTIVE_EXCLUDED: Operation['status'][] = ['Entregado', 'Cerrado']

export function answerLogixQuestion(question: string, data: LogixData, contextOperationId?: string, now: Date = new Date()): LogixAnswer {
  const q = normalize(question)
  if (!q) return { text: 'Escriba una pregunta sobre sus operaciones, documentos o cotizaciones.' }

  // 1) Referencia explícita a un DO en la pregunta.
  const doMatch = /do-?\s?(\d{2}-\d{4})/i.exec(question)
  if (doMatch) {
    const number = `DO-${doMatch[1]}`.toUpperCase()
    const op = data.operations.find((o) => o.doNumber.toUpperCase() === number)
    if (!op) return unavailable(`No encontré la operación ${number} en su empresa.`)
    return describeOperation(op)
  }

  // 2) Preguntas sobre la operación de contexto (si se abrió desde un DO).
  if (contextOperationId && /(estado|esta|operacion|eta|etd|fecha|cuando|llega|zarp)/.test(q)) {
    const op = data.operations.find((o) => o.id === contextOperationId)
    if (op) return describeOperation(op)
  }

  if (/(cuantas|cuantos|activas?|activos?)/.test(q) && /(operacion|do)/.test(q)) {
    const active = data.operations.filter((o) => !ACTIVE_EXCLUDED.includes(o.status))
    return {
      text: `Tiene ${active.length} operaciones activas de ${data.operations.length} registradas. ${summaryByStatus(active)}`,
      operationIds: active.map((o) => o.id),
    }
  }

  if (/(respuesta|pendiente|accion|requer|espera)/.test(q) && !/cotiz/.test(q)) {
    const pending = data.operations.filter((o) => o.pendingClientResponse)
    if (pending.length === 0) return { text: 'No hay operaciones que esperen su respuesta en este momento.', operationIds: [] }
    return {
      text: `${pending.length} operación(es) esperan su respuesta: ${pending.map((o) => o.doNumber).join(', ')}.`,
      operationIds: pending.map((o) => o.id),
    }
  }

  if (/(document|vencid|vigenc|vence)/.test(q)) {
    const expiredOrSoon = data.documents.filter((d) => d.status !== 'vigente' || daysUntil(d.expiresAt, now) < 0)
    if (expiredOrSoon.length === 0) return { text: 'Todos sus documentos están vigentes.' }
    const lines = expiredOrSoon
      .map((d) => `• ${d.name}: ${daysUntil(d.expiresAt, now) < 0 ? 'vencido' : 'vence'} el ${formatDate(d.expiresAt)}`)
      .join('\n')
    return { text: `Tiene ${expiredOrSoon.length} documento(s) vencidos o próximos a vencer:\n${lines}` }
  }

  if (/cotiz/.test(q)) {
    const pending = data.quotes.filter((quote) => quote.status === 'Pendiente')
    if (pending.length === 0) return { text: 'No tiene cotizaciones pendientes de decisión.' }
    const lines = pending
      .map((quote) => `• ${quote.number} · ${quote.service}: ${formatMoney(total(quote), quote.currency)} (vigente hasta ${formatDate(quote.validUntil)})`)
      .join('\n')
    return { text: `Cotizaciones pendientes (${pending.length}):\n${lines}` }
  }

  return unavailable('No tengo esa información en los datos DEMO autorizados para su empresa. Puede preguntarme por operaciones, documentos o cotizaciones.')
}

export function describeOperation(op: Operation): LogixAnswer {
  const parts = [
    `${op.doNumber} (${op.reference}) está en estado "${op.status}".`,
    `Ruta: ${op.origin} → ${op.destination}.`,
    op.eta ? `ETA: ${formatDate(op.eta)}${op.ata ? ` (llegó el ${formatDate(op.ata)})` : ''}.` : null,
    op.pendingClientResponse ? 'Esta operación requiere su respuesta.' : null,
  ].filter(Boolean)
  return { text: parts.join(' '), operationIds: [op.id] }
}

function summaryByStatus(ops: Operation[]): string {
  const counts = new Map<string, number>()
  ops.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1))
  return [...counts.entries()].map(([s, n]) => `${s}: ${n}`).join(' · ')
}

function total(quote: Quote): number {
  return quote.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
}

function unavailable(text: string): LogixAnswer {
  return { text, unavailable: true }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}
