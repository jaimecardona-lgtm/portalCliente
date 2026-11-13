/**
 * Selector global de empresa para personal interno (barra superior).
 *
 * Responsabilidad: buscar entre las empresas que el servidor devuelve como verificadas y habilitadas para el rol,
 * pedir el motivo de soporte y fijar el contexto de trabajo. Muestra siempre la empresa activa.
 * Reglas:
 * - La lista viene de GET /staff/tenants. Sin empresas, lo dice. Ninguna empresa de ejemplo.
 * - El cambio exige motivo; el servidor valida rol, alcance, verificación y estado, y audita el cambio.
 * - Al cambiar se borra la caché de la empresa anterior (consultas de tenant y de operaciones de soporte).
 */
import { useContext, useMemo, useRef, useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronDown, X } from 'lucide-react'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { setActiveStaffTenant, useActiveStaffTenant } from '@/services/auth/staff-context'
import { staffErrorMessage, type StaffTenant } from '@/services/api/staff-api'
import { cn } from '@/lib/format'

const REASON_MIN = 3
const REASON_MAX = 300

export function StaffTenantSwitcher() {
  const portal = useContext(SupabasePortalContext)
  const api = portal?.staff ?? null
  const queryClient = useQueryClient()
  const active = useActiveStaffTenant()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<StaffTenant | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const tenants = useQuery({
    queryKey: ['supabase', 'staff-tenants'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.tenants(),
  })

  const list = useMemo(() => {
    const term = query.trim().toLowerCase()
    const all = tenants.data ?? []
    if (!term) return all
    return all.filter((t) => t.legalName.toLowerCase().includes(term) || (t.externalTenantId ?? '').toLowerCase().includes(term))
  }, [tenants.data, query])

  /** Limpia lo que pertenece a la empresa anterior antes de mostrar la nueva. */
  const clearTenantCache = () => {
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-operations'] })
    queryClient.removeQueries({ queryKey: ['tenant'] })
  }

  const change = useMutation({
    mutationFn: (args: { tenant: StaffTenant; reason: string }) =>
      api!.selectContext(args.tenant.id, args.reason).then(() => args.tenant),
    onSuccess: (tenant) => {
      clearTenantCache()
      setActiveStaffTenant(tenant)
      setPending(null)
      setReason('')
      setMessage(null)
      setOpen(false)
    },
    onError: (error) => setMessage(staffErrorMessage(error)),
  })

  const exit = useMutation({
    mutationFn: () => api!.exitContext(),
    onSuccess: () => {
      clearTenantCache()
      setActiveStaffTenant(null)
      setMessage(null)
    },
    onError: (error) => setMessage(staffErrorMessage(error)),
  })

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (api === null) return null

  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={active ? `Empresa de trabajo: ${active.legalName}` : 'Seleccionar empresa de trabajo'}
        className={cn(
          'flex h-10 max-w-[240px] items-center gap-2 rounded-lg border px-3 text-sm transition-colors duration-200',
          active ? 'border-blue/40 bg-blue-50 text-navy-700' : 'border-line bg-canvas text-ink-muted hover:bg-surface-muted',
        )}
      >
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="truncate font-medium">{active ? active.legalName : 'Seleccione una empresa'}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Empresas autorizadas para soporte"
          className="absolute right-0 z-50 mt-2 w-[min(340px,calc(100vw-2rem))] animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Empresa de trabajo</p>
            {active && (
              <button type="button" onClick={() => exit.mutate()} disabled={exit.isPending} className="text-xs font-semibold text-blue hover:underline disabled:opacity-50">
                Salir del contexto
              </button>
            )}
          </div>

          {pending ? (
            <form
              className="flex flex-col gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!reasonValid) return
                change.mutate({ tenant: pending, reason: reason.trim() })
              }}
            >
              <p className="text-sm text-ink">
                Cambiar a <span className="font-semibold">{pending.legalName}</span>
              </p>
              <label htmlFor="staff-reason" className="text-xs font-semibold text-ink-soft">
                Motivo de soporte (obligatorio, queda registrado)
              </label>
              <input
                id="staff-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                autoFocus
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPending(null)} className="h-9 rounded-lg px-3 text-sm text-ink-soft hover:bg-surface-muted">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!reasonValid || change.isPending}
                  className="h-9 rounded-lg bg-blue px-3 text-sm font-medium text-white hover:bg-navy disabled:opacity-40"
                >
                  Confirmar cambio
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <label htmlFor="staff-tenant-search" className="sr-only">Buscar empresa</label>
              <input
                id="staff-tenant-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o identificador oficial"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
              />

              {tenants.isPending && <p className="text-sm text-ink-muted">Cargando empresas…</p>}
              {tenants.isError && <p className="text-sm text-danger-700">{staffErrorMessage(tenants.error)}</p>}
              {tenants.isSuccess && (tenants.data.length === 0) && (
                <p className="text-sm text-ink-muted">Sin empresas verificadas asignadas a su rol.</p>
              )}
              {tenants.isSuccess && tenants.data.length > 0 && list.length === 0 && (
                <p className="text-sm text-ink-muted">Ninguna empresa coincide con la búsqueda.</p>
              )}

              {list.length > 0 && (
                <ul role="listbox" aria-label="Empresas" className="max-h-72 overflow-y-auto">
                  {list.map((t) => {
                    const isActive = active?.id === t.id
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            setMessage(null)
                            if (isActive) setOpen(false)
                            else setPending(t)
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{t.legalName}</span>
                            <span className="block truncate text-xs text-ink-muted">
                              Identificador oficial: {t.externalTenantId ?? 'no disponible'}
                            </span>
                          </span>
                          {isActive && <Check className="size-4 shrink-0 text-blue" aria-label="Empresa activa" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {message && (
            <p role="alert" className="flex items-start gap-2 border-t border-line bg-danger-50 px-4 py-2.5 text-xs text-danger-700">
              <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
