import type { OperationStatus } from '@/types/domain'
import { STATUS_META } from '@/features/operations/status'
import { Badge } from './primitives'

/** Estado de operación con color, icono y texto: nunca depende solo del color. */
export function OperationStatusBadge({ status, className }: { status: OperationStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge tone={meta.tone} icon={<Icon className="size-3.5" aria-hidden />} className={className}>
      {status}
    </Badge>
  )
}
