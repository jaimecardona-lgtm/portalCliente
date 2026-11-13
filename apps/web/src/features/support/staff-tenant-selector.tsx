/**
 * Selector de empresa de trabajo del personal interno (sidebar, sección Soporte).
 *
 * Responsabilidad: listar las empresas verificadas y asignadas al rol y fijar el contexto en el servidor.
 * Reglas: solo muestra lo que devuelve GET /staff/tenants. Sin empresas, lo dice. Sin lista de ejemplo.
 * El contexto de trabajo vive en memoria (staff-context.ts) y se comparte con el panel de soporte.
 */
import { useContext, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { setActiveStaffTenant, useActiveStaffTenant } from '@/services/auth/staff-context'
import { staffErrorMessage, type StaffTenant } from '@/services/api/staff-api'
import { cn } from '@/lib/format'

export function StaffTenantSelector({ collapsed }: { collapsed: boolean }) {
  const portal = useContext(SupabasePortalContext)
  const api = portal?.staff ?? null
  const queryClient = useQueryClient()
  const active = useActiveStaffTenant()
  const [message, setMessage] = useState<string | null>(null)

  const tenants = useQuery({
    queryKey: ['supabase', 'staff-tenants'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.tenants(),
  })

  const select = useMutation({
    mutationFn: (tenant: StaffTenant) => api!.selectContext(tenant.id).then(() => tenant),
    onSuccess: (tenant) => {
      queryClient.removeQueries({ queryKey: ['supabase', 'staff-operations'] })
      setActiveStaffTenant(tenant)
      setMessage(null)
    },
    onError: (error) => setMessage(staffErrorMessage(error)),
  })

  const exit = useMutation({
    mutationFn: () => api!.exitContext(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['supabase', 'staff-operations'] })
      setActiveStaffTenant(null)
      setMessage(null)
    },
    onError: (error) => setMessage(staffErrorMessage(error)),
  })

  if (collapsed || api === null) return null

  const list = tenants.data ?? []

  return (
    <div className="mx-3 mb-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
      <label htmlFor="staff-tenant" className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Empresa de trabajo
      </label>
      {tenants.isPending && <p className="mt-2 text-xs text-white/50">Cargando empresas…</p>}
      {tenants.isError && <p className="mt-2 text-xs text-white/60">{staffErrorMessage(tenants.error)}</p>}
      {tenants.isSuccess && list.length === 0 && (
        <p className="mt-2 text-xs text-white/60">Sin empresas verificadas asignadas a su rol.</p>
      )}
      {tenants.isSuccess && list.length > 0 && (
        <select
          id="staff-tenant"
          value={active?.id ?? ''}
          disabled={select.isPending || exit.isPending}
          onChange={(e) => {
            const next = list.find((t) => t.id === e.target.value)
            if (next) select.mutate(next)
          }}
          className={cn(
            'mt-2 h-9 w-full truncate rounded-lg border border-white/10 bg-midnight px-2 text-sm text-white',
            'focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/40',
          )}
        >
          <option value="">Seleccione una empresa</option>
          {list.map((t) => (
            <option key={t.id} value={t.id}>
              {t.legalName}
            </option>
          ))}
        </select>
      )}
      {active && (
        <button
          type="button"
          onClick={() => exit.mutate()}
          disabled={exit.isPending}
          className="mt-2 text-xs font-semibold text-blue hover:underline disabled:opacity-50"
        >
          Salir del contexto
        </button>
      )}
      {message && (
        <p role="alert" className="mt-2 text-xs text-warning-200">
          {message}
        </p>
      )}
    </div>
  )
}
