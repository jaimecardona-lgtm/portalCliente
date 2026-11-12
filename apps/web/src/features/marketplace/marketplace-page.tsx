import { Anchor, Warehouse, ShieldCheck, Container } from 'lucide-react'
import { Badge, Card, SectionHeading } from '@/components/ui/primitives'

/**
 * Marketplace: solo visual, funcionalidad futura.
 * Intencionalmente sin botones de acción para no prometer capacidades inexistentes.
 */
const FUTURE_SERVICES = [
  { icon: Container, title: 'Reservas de espacio', text: 'Comparación de tarifas y espacios disponibles por ruta.' },
  { icon: Warehouse, title: 'Bodegaje y consolidación', text: 'Servicios de almacenamiento y consolidación de carga.' },
  { icon: Anchor, title: 'Seguros de carga', text: 'Cobertura para embarques de importación y exportación.' },
  { icon: ShieldCheck, title: 'Asesoría aduanera', text: 'Acompañamiento en trámites y clasificación arancelaria.' },
]

export function MarketplacePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Próximamente</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Marketplace logístico</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Estamos diseñando un espacio para contratar servicios logísticos complementarios desde el portal. Esta sección aún no está disponible.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {FUTURE_SERVICES.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.title} className="flex gap-4 p-5 opacity-90">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-muted text-ink-muted">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{s.title}</h2>
                  <Badge tone="neutral">Fase futura</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{s.text}</p>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-5 sm:p-6">
        <SectionHeading title="¿Qué incluirá esta sección?" description="El alcance definitivo se confirmará con el equipo comercial de Logixtic." />
        <p className="text-sm text-ink-soft">Por ahora no hay acciones disponibles. Sus operaciones, documentos y cotizaciones siguen disponibles en el resto del portal.</p>
      </Card>
    </div>
  )
}
