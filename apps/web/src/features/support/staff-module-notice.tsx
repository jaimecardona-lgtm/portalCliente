/**
 * Disponibilidad de las vistas de empresa para personal interno (dentro de la tabla o sección original).
 *
 * Responsabilidad: explicar, con el texto preciso, por qué no hay datos de empresa en una vista.
 * Reglas: no hace peticiones, no muestra ceros ni cifras, y no usa datos de ejemplo.
 * - Sin empresa de trabajo: pide seleccionar una empresa autorizada en el selector de soporte.
 * - Con empresa de trabajo: la vista aún no tiene contrato de lectura para personal interno.
 */
import { Link } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { Card, EmptyState, SectionHeading } from '@/components/ui/primitives'
import { useActiveStaffTenant } from '@/services/auth/staff-context'

export function StaffModuleNotice({ noun, hasContext }: { noun: string; hasContext: boolean }) {
  if (!hasContext) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-6" aria-hidden />}
        title={`Selecciona una empresa autorizada para consultar sus ${noun}`}
        description="Elija una empresa verificada en el selector de la barra superior."
      />
    )
  }
  return (
    <EmptyState
      icon={<ShieldCheck className="size-6" aria-hidden />}
      title={`Las ${noun} de esta empresa todavía no están disponibles para personal interno`}
      description="Las operaciones sincronizadas aparecen en el panel de soporte."
      action={
        <Link to="/soporte" className="font-semibold text-blue hover:underline">
          Ir al panel de soporte
        </Link>
      }
    />
  )
}

/**
 * Sección completa para personal interno cuando la vista es de una empresa: conserva el encabezado de la página
 * y muestra la disponibilidad en lugar de montar la pantalla (que consultaría datos de cliente).
 */
export function StaffSectionPage({ title, description, noun }: { title: string; description?: string; noun: string }) {
  const activeStaff = useActiveStaffTenant()
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title={title} description={description} />
      <Card className="p-6">
        <StaffModuleNotice noun={noun} hasContext={Boolean(activeStaff)} />
      </Card>
    </div>
  )
}
