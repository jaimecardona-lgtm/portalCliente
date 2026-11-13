/**
 * Estados de operación y su presentación.
 *
 * Responsabilidad: definir el orden de los estados, su tono visual, su icono y su posición en el flujo
 * (step). Cambiar el orden afecta al cálculo de progreso del detalle y del dashboard.
 * Accesibilidad: cada estado se identifica por texto e icono, nunca solo por color.
 */
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Anchor, Ship, Archive, FileText, type LucideIcon } from 'lucide-react'
import type { OperationStatus } from '@/types/domain'
import type { Tone } from '@/components/ui/primitives'

export interface StatusMeta {
  tone: Tone
  icon: LucideIcon
  /** Color de la línea de progreso y del punto del timeline. */
  dot: string
  /** Posición en el flujo lineal (0–5). Cerrado y Pendiente se muestran fuera del flujo principal. */
  step: number
}

/** Estados reales de la carga QA (filtros y KPI). Los heredados del diseño original quedan en STATUS_META. */
export const OPERATION_STATUSES: OperationStatus[] = [
  'Abierto',
  'En tránsito',
  'Finalizado',
  'En proceso de facturación',
  'Cerrado / Liquidado',
]

export const STATUS_META: Record<OperationStatus, StatusMeta> = {
  Abierto: { tone: 'neutral', icon: CircleDot, dot: 'bg-ink-muted', step: 0 },
  Finalizado: { tone: 'success', icon: CheckCircle2, dot: 'bg-success', step: 2 },
  'En proceso de facturación': { tone: 'warning', icon: FileText, dot: 'bg-warning', step: 3 },
  'Cerrado / Liquidado': { tone: 'brand', icon: Archive, dot: 'bg-navy', step: 5 },
  Creado: { tone: 'neutral', icon: CircleDot, dot: 'bg-ink-muted', step: 0 },
  'En tránsito': { tone: 'info', icon: Ship, dot: 'bg-blue', step: 1 },
  'En puerto': { tone: 'brand', icon: Anchor, dot: 'bg-blue', step: 2 },
  'En aduana': { tone: 'warning', icon: Clock, dot: 'bg-warning', step: 3 },
  'Pendiente cliente': { tone: 'danger', icon: AlertTriangle, dot: 'bg-danger', step: 3 },
  Entregado: { tone: 'success', icon: CheckCircle2, dot: 'bg-success', step: 4 },
  Cerrado: { tone: 'neutral', icon: Archive, dot: 'bg-ink-soft', step: 5 },
  'Estado no reconocido': { tone: 'warning', icon: AlertTriangle, dot: 'bg-warning', step: 0 },
}

export const TRANSPORT_OPTIONS = ['Marítimo FCL', 'Marítimo LCL', 'Aéreo', 'Terrestre'] as const
export const KIND_OPTIONS = ['Importación', 'Exportación', 'Nacionalización'] as const
