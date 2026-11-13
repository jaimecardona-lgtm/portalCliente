/**
 * Lista de empresas verificadas (no sintéticas) para el selector en desarrollo. SOLO DESARROLLO.
 * Separa las empresas de demostración de las verificadas: no se mezclan en la misma lista.
 */
import { tenantCategory, type StaffTenant } from '@/services/api/staff-api'
import { isDemoTenant } from './staff-tenant-parts'

/*
 * Estados separados (siempre con texto e icono): integración oficial y disponibilidad QA. Una empresa QA
 * sin identificador oficial no muestra «Identificador oficial: null»: su integración figura como pendiente.
 */
export function StaffVerifiedTenants({
  tenants, activeId, onPick,
}: { tenants: StaffTenant[]; activeId: string | null; onPick: (t: StaffTenant) => void }) {
  const real = tenants.filter((t) => !isDemoTenant(t))
  return (
    <section aria-labelledby="verified-title" className="flex flex-col gap-1">
      <h3 id="verified-title" className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Empresas asignadas
      </h3>
      {real.length === 0 && <p className="px-1 text-sm text-ink-muted">Sin empresas asignadas a su rol.</p>}
      <ul className="flex flex-col">
        {real.map((t) => {
          const category = tenantCategory(t)
          return (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={activeId === t.id}
                onClick={() => onPick(t)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{t.legalName}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {category.officialIcon} {category.officialLabel}
                  </span>
                  {category.qaLabel && (
                    <span className="block truncate text-xs font-medium text-ink-soft">◇ {category.qaLabel}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
