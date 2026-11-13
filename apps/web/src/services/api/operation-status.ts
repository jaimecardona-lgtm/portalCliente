/**
 * Mapping centralizado de `operation_refs.last_known_status` (PostgreSQL) al estado visible del portal.
 *
 * Reglas:
 * - Los cinco valores reales de la carga QA son: Abierto, En tránsito, Finalizado, En proceso de facturación,
 *   Cerrado / Liquidado. Se muestran tal cual; no se convierten en otros estados (p. ej. Finalizado ≠ Entregado).
 * - Solo se normalizan diferencias técnicas (espacios, mayúsculas, acentos, separador «/»). No hay sinónimos.
 * - Un valor fuera de la tabla no se oculta ni se sustituye: se muestra como «Estado no reconocido» con el texto original.
 * - Los estados heredados del diseño original se mantienen con su propio significado, por si la base los tuviera.
 */
import type { OperationStatus } from '@/types/domain'

const CANONICAL: Record<string, OperationStatus> = {
  abierto: 'Abierto',
  'en transito': 'En tránsito',
  finalizado: 'Finalizado',
  'en proceso de facturacion': 'En proceso de facturación',
  'cerrado / liquidado': 'Cerrado / Liquidado',
  // Estados heredados del diseño original (significado propio, no sinónimos de los anteriores).
  creado: 'Creado',
  'en puerto': 'En puerto',
  'en aduana': 'En aduana',
  'pendiente cliente': 'Pendiente cliente',
  entregado: 'Entregado',
  cerrado: 'Cerrado',
}

/** Clave comparable: sin acentos, en minúsculas, con espacios y separador «/» normalizados. */
export function operationStatusKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface NormalizedStatus {
  status: OperationStatus
  /** Valor original cuando no se reconoce; null si coincide con un estado del dominio. */
  statusRaw: string | null
}

/** Estado visible a partir del valor de la API. Sin valor o sin coincidencia: «Estado no reconocido». */
export function normalizeOperationStatus(raw: unknown): NormalizedStatus {
  if (typeof raw !== 'string') return { status: 'Estado no reconocido', statusRaw: raw == null ? null : String(raw) }
  const known = CANONICAL[operationStatusKey(raw)]
  if (known) return { status: known, statusRaw: null }
  return { status: 'Estado no reconocido', statusRaw: raw }
}

/** Todos los valores del dominio que el mapping acepta (incluye los heredados). */
export const KNOWN_STATUS_VALUES: readonly OperationStatus[] = Object.values(CANONICAL)
