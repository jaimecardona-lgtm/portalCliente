import { Info } from 'lucide-react'

/** Solo se carga en Vite dev; el build de producción elimina la importación que lo referencia. */
export function DemoDataBanner() {
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-ink">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span><strong>DEMO · Datos de ejemplo.</strong> Vista aislada local; no son registros persistidos ni emitidos por Logixtic.</span>
    </p>
  )
}
