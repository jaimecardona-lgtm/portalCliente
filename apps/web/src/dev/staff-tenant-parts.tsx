/**
 * Partes de demostración del selector de personal. SOLO DESARROLLO.
 *
 * Se carga con `import.meta.env.DEV` literal desde el selector: en producción el módulo y su texto
 * desaparecen del bundle. Fuera de esta carpeta no puede haber texto de demostración en la interfaz.
 * Las empresas de demostración son sintéticas y se identifican siempre como tales.
 */
import type { StaffTenant } from '@/services/api/staff-api'

export const DEMO_PREFIX = 'DEMO-'
export const isDemoTenant = (t: StaffTenant) => (t.externalTenantId ?? '').startsWith(DEMO_PREFIX)

export function StaffDemoParts(props:
  | { part: 'section'; tenants: StaffTenant[]; activeId: string | null; onPick: (t: StaffTenant) => void }
  | { part: 'badge' }
  | { part: 'notice' }) {
  if (props.part === 'badge') {
    return <span className="shrink-0 rounded bg-warning-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink">Demo</span>
  }
  if (props.part === 'notice') {
    return <p className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-ink">DATOS DE DEMOSTRACIÓN · sintéticos, no reales</p>
  }
  const demo = props.tenants.filter(isDemoTenant)
  return (
    <section aria-labelledby="demo-title" className="flex flex-col gap-1">
      <h3 id="demo-title" className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Demostración · datos sintéticos
      </h3>
      {demo.length === 0 && <p className="px-1 text-sm text-ink-muted">Sin empresas de demostración asignadas a su rol.</p>}
      <ul className="flex flex-col">
        {demo.map((t) => {
          const isActive = props.activeId === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => props.onPick(t)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{t.legalName}</span>
                  <span className="block truncate text-xs text-ink-muted">DATOS DE DEMOSTRACIÓN · {t.externalTenantId}</span>
                </span>
                {isActive && <span className="text-xs font-semibold text-blue">Activa</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
