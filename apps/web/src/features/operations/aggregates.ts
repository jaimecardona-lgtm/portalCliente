/**
 * Agregados de operaciones compartidos por la Torre de Control y el listado (una sola fuente).
 *
 * Criterio de negocio (documentado, no inferido de otros estados):
 * - Activas = Abierto + En tránsito.
 * - En movimiento = En tránsito.
 * - Finalizadas, En proceso de facturación y Cerrado / Liquidado cuentan por separado.
 * - Requieren respuesta = pending_client_response === true. NULL significa «sin información»: no se deduce del estado.
 * Un agregado sin datos (carga pendiente o error) se representa como null, nunca como 0.
 */
import type { Operation, OperationStatus } from '@/types/domain'

export const ACTIVE_STATUSES: readonly OperationStatus[] = ['Abierto', 'En tránsito']

export interface OperationAggregates {
  total: number
  active: number
  inMotion: number
  finalized: number
  billing: number
  closed: number
  /** true si al menos una operación tiene el dato de respuesta. Si no, el indicador muestra «sin información». */
  responseKnown: boolean
  pending: number
}

export function operationAggregates(ops: ReadonlyArray<Pick<Operation, 'status' | 'pendingClientResponse'>>): OperationAggregates {
  const count = (status: OperationStatus) => ops.filter((o) => o.status === status).length
  return {
    total: ops.length,
    active: ops.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
    inMotion: count('En tránsito'),
    finalized: count('Finalizado'),
    billing: count('En proceso de facturación'),
    closed: count('Cerrado / Liquidado'),
    responseKnown: ops.some((o) => o.pendingClientResponse !== null),
    pending: ops.filter((o) => o.pendingClientResponse === true).length,
  }
}
