/**
 * Estado de las vistas de empresa (operaciones, documentos, cotizaciones, solicitudes) para personal interno.
 *
 * Responsabilidad: explicar por qué no hay datos de empresa en esta pantalla, sin consultarlos.
 * Reglas: no hace peticiones, no muestra ceros ni cifras, y no usa datos de ejemplo. El contexto de empresa lo fija
 * el panel de soporte con el servidor; esta vista no tiene contrato de lectura para personal interno todavía.
 */
import { Link } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/primitives'

export function StaffModuleNotice() {
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon={<ShieldCheck className="size-6" aria-hidden />}
        title="Selecciona una empresa autorizada para consultar sus operaciones"
        description="Esta vista muestra información de una empresa cliente. Desde el panel de soporte, elija una empresa verificada y asignada a su rol. Las demás vistas de empresa todavía no están disponibles para personal interno."
        action={
          <Link to="/soporte" className="font-semibold text-blue hover:underline">
            Ir al panel de soporte
          </Link>
        }
      />
    </Card>
  )
}
