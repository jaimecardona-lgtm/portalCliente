import type { Operation, OperationStatus } from '@/types/domain'
import { OPERATION_STATUSES } from './status'

export type SortKey = 'doNumber' | 'status' | 'etd' | 'eta' | 'origin' | 'destination' | 'updatedAt'
export type SortDir = 'asc' | 'desc'

export interface OperationFilters {
  q: string
  statuses: OperationStatus[]
  kind: string
  transport: string
  /** Rango sobre la fecha de referencia (ETD, o fecha de creación si no hay ETD). ISO yyyy-mm-dd. */
  from: string
  to: string
  pendingOnly: boolean
  sort: SortKey
  dir: SortDir
}

export const DEFAULT_FILTERS: OperationFilters = {
  q: '',
  statuses: [],
  kind: '',
  transport: '',
  from: '',
  to: '',
  pendingOnly: false,
  sort: 'etd',
  dir: 'desc',
}

export const SORT_KEYS: SortKey[] = ['doNumber', 'status', 'etd', 'eta', 'origin', 'destination', 'updatedAt']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/** Normaliza el objeto de búsqueda de la URL. Valores inválidos vuelven al valor por defecto. */
export function parseOperationSearch(raw: Record<string, unknown>): OperationFilters {
  const statusesRaw = str(raw.status)
  const statuses = statusesRaw
    ? statusesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is OperationStatus => (OPERATION_STATUSES as string[]).includes(s))
    : []
  const sort = SORT_KEYS.includes(str(raw.sort) as SortKey) ? (str(raw.sort) as SortKey) : DEFAULT_FILTERS.sort
  const dir: SortDir = str(raw.dir) === 'asc' ? 'asc' : 'desc'
  const from = DATE_RE.test(str(raw.from)) ? str(raw.from) : ''
  const to = DATE_RE.test(str(raw.to)) ? str(raw.to) : ''
  return {
    q: str(raw.q).slice(0, 80),
    statuses,
    kind: str(raw.kind),
    transport: str(raw.transport),
    from,
    to,
    pendingOnly: str(raw.pendiente) === '1',
    sort,
    dir,
  }
}

/** Convierte filtros a parámetros de URL, omitiendo valores por defecto. */
export function toSearchParams(f: OperationFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.q) out.q = f.q
  if (f.statuses.length) out.status = f.statuses.join(',')
  if (f.kind) out.kind = f.kind
  if (f.transport) out.transport = f.transport
  if (f.from) out.from = f.from
  if (f.to) out.to = f.to
  if (f.pendingOnly) out.pendiente = '1'
  if (f.sort !== DEFAULT_FILTERS.sort) out.sort = f.sort
  if (f.dir !== DEFAULT_FILTERS.dir) out.dir = f.dir
  return out
}

export function referenceDate(op: Operation): string {
  return op.etd ?? op.createdAt
}

export function applyOperationFilters(ops: Operation[], f: OperationFilters): Operation[] {
  const term = f.q.trim().toLowerCase()
  const filtered = ops.filter((op) => {
    if (f.statuses.length && !f.statuses.includes(op.status)) return false
    if (f.kind && op.kind !== f.kind) return false
    if (f.transport && op.transport !== f.transport) return false
    if (f.pendingOnly && !op.pendingClientResponse) return false
    const ref = referenceDate(op)
    if (f.from && ref < f.from) return false
    if (f.to && ref > f.to) return false
    if (term) {
      const haystack = [op.doNumber, op.reference, op.booking, op.ordenNumber, op.origin, op.destination]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
  return sortOperations(filtered, f.sort, f.dir)
}

export function sortOperations(ops: Operation[], key: SortKey, dir: SortDir): Operation[] {
  const sign = dir === 'asc' ? 1 : -1
  const valueOf = (op: Operation): string => {
    switch (key) {
      case 'status':
        return String(OPERATION_STATUSES.indexOf(op.status)).padStart(2, '0')
      case 'etd':
        return op.etd ?? ''
      case 'eta':
        return op.eta ?? ''
      case 'origin':
        return op.origin
      case 'destination':
        return op.destination
      case 'updatedAt':
        return op.updatedAt
      case 'doNumber':
      default:
        return op.doNumber
    }
  }
  // Valores vacíos siempre al final, sin importar la dirección.
  return [...ops].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    if (!va && vb) return 1
    if (va && !vb) return -1
    return va.localeCompare(vb) * sign
  })
}

export function countActiveFilters(f: OperationFilters): number {
  return (
    (f.q ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.kind ? 1 : 0) +
    (f.transport ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    (f.pendingOnly ? 1 : 0)
  )
}
