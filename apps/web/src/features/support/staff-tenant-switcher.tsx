/**
 * Selector global de empresa para personal interno (barra superior): «Empresas de Logixtic».
 *
 * Fuente única: GET /staff/tenants (public.tenants, filtrado por el servidor con RLS y permisos QA). El catálogo
 * logixtic_tenant_discovery NO se muestra aquí; sigue existiendo para conciliación e integración futura.
 * Reglas:
 * - Solo se listan los nombres y slugs que devuelve la API. Ningún catálogo alternativo en React.
 * - El cambio de empresa exige confirmar la contraseña (Supabase Auth) y el servidor valida challenge, rol y alcance.
 * - Al cambiar se borra la caché de la empresa anterior. Un error al cargar no borra la empresa activa.
 * - El indicador DEMO viene de src/dev (solo desarrollo): la copia de la interfaz no contiene esa palabra.
 */
import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronDown, X } from 'lucide-react'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import {
  clearPersistedStaffTenant,
  persistStaffTenant,
  readPersistedStaffTenantId,
  setActiveStaffTenant,
  useActiveStaffTenant,
} from '@/services/auth/staff-context'
import { staffErrorMessage, type StaffTenant } from '@/services/api/staff-api'
import { PasswordRejectedError, reauthenticateWithPassword } from '@/services/auth/reauth'

/* Indicador de datos de demostración: solo se carga en desarrollo (con import.meta.env.DEV falso no entra en el bundle). */
const DevParts = import.meta.env.DEV
  ? lazy(() => import('@/dev/staff-tenant-parts').then((m) => ({ default: m.StaffDemoParts })))
  : null

export function StaffTenantSwitcher() {
  const portal = useContext(SupabasePortalContext)
  const api = portal?.staff ?? null
  const queryClient = useQueryClient()
  const active = useActiveStaffTenant()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<StaffTenant | null>(null)
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const tenants = useQuery({
    queryKey: ['supabase', 'staff-tenants'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.tenants(),
  })

  /* Identidad de la sesión (para ligar el UUID persistido al usuario). Misma clave que /soporte. */
  const me = useQuery({
    queryKey: ['supabase', 'staff-me'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.me(),
  })

  /*
   * Restauración tras recargar: el UUID guardado (sessionStorage, ligado al usuario) solo se usa si el servidor
   * sigue listando esa empresa para la sesión. Un error al cargar no borra nada.
   */
  useEffect(() => {
    if (active !== null || !me.data || !tenants.isSuccess) return
    const id = readPersistedStaffTenantId(me.data.userId)
    if (!id) return
    const found = (tenants.data ?? []).find((t) => t.id === id)
    if (found) setActiveStaffTenant(found)
    else persistStaffTenant(me.data.userId, null)
  }, [active, me.data, tenants.isSuccess, tenants.data])

  const term = query.trim().toLowerCase()
  const visible = (tenants.data ?? []).filter(
    (t) => !term || t.legalName.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term),
  )

  /** Limpia lo que pertenece a la empresa anterior antes de mostrar la nueva. */
  const clearTenantCache = () => {
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-operations'] })
    queryClient.removeQueries({ queryKey: ['tenant'] })
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-requests'] })
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-client-accounts'] })
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-client-documents'] })
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-tenant-profile'] })
  }

  /*
   * Confirmación con contraseña. La contraseña no se guarda en estado de consultas ni se envía a FastAPI:
   * solo viaja a Supabase Auth, y el campo se vacía al terminar el intento, tenga éxito o no.
   */
  const confirmChange = async (tenant: StaffTenant, typed: string) => {
    if (!portal) return
    setConfirming(true)
    setMessage(null)
    try {
      const email = await portal.auth.currentEmail()
      if (!email) throw new Error('No se pudo verificar la cuenta. Inicie sesión de nuevo.')
      const challenge = await api!.requestContextChallenge(tenant.id)
      const reauthToken = await reauthenticateWithPassword(email, typed, {
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      })
      await api!.selectContext(tenant.id, challenge.challengeId, reauthToken)
      clearTenantCache()
      setActiveStaffTenant(tenant)
      if (me.data) persistStaffTenant(me.data.userId, tenant.id)
      setPending(null)
      setOpen(false)
    } catch (error) {
      setMessage(
        error instanceof PasswordRejectedError
          ? 'La contraseña no es correcta. Se mantiene la empresa actual.'
          : staffErrorMessage(error),
      )
    } finally {
      setPassword('')
      setConfirming(false)
    }
  }

  const exit = useMutation({
    mutationFn: () => api!.exitContext(),
    onSuccess: () => {
      clearTenantCache()
      setActiveStaffTenant(null)
      clearPersistedStaffTenant()
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

  const passwordValid = password.length > 0
  const pick = (t: StaffTenant) => {
    setMessage(null)
    if (active?.id === t.id) setOpen(false)
    else setPending(t)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={active ? `Empresa de trabajo: ${active.legalName}` : 'Seleccionar empresa de trabajo'}
        className="flex h-10 max-w-[260px] items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-ink-muted transition-colors duration-200 hover:bg-surface-muted aria-expanded:border-blue/40"
      >
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="truncate font-medium">{active ? active.legalName : 'Seleccione una empresa'}</span>
        {active?.qaSynthetic && DevParts && (
          <Suspense fallback={null}>
            <DevParts part="badge" />
          </Suspense>
        )}
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Empresas de Logixtic"
          className="absolute right-0 z-50 mt-2 flex max-h-[min(560px,80vh)] w-[min(360px,calc(100vw-2rem))] animate-slide-up flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Empresas de Logixtic</p>
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
                if (!passwordValid || confirming) return
                void confirmChange(pending, password)
              }}
            >
              <p className="text-sm font-semibold text-ink">Cambiar empresa de trabajo</p>
              <p className="text-sm text-ink">
                Destino: <span className="font-semibold">{pending.legalName}</span>
              </p>
              <label htmlFor="staff-password" className="text-xs font-semibold text-ink-soft">
                Contraseña de tu cuenta
              </label>
              <input
                id="staff-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={confirming}
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending(null)
                    setPassword('')
                    setMessage(null)
                  }}
                  disabled={confirming}
                  className="h-9 rounded-lg px-3 text-sm text-ink-soft hover:bg-surface-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!passwordValid || confirming}
                  className="h-9 rounded-lg bg-blue px-3 text-sm font-medium text-white hover:bg-navy disabled:opacity-40"
                >
                  Confirmar cambio
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <label htmlFor="staff-tenant-search" className="sr-only">Buscar empresa</label>
              <input
                id="staff-tenant-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o código"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
              />

              {tenants.isPending && <p className="px-1 text-sm text-ink-muted">Cargando empresas…</p>}
              {tenants.isError && <p className="px-1 text-sm text-danger-700">{staffErrorMessage(tenants.error)}</p>}
              {tenants.isSuccess && visible.length === 0 && (
                <p className="px-1 text-sm text-ink-muted">Sin empresas asignadas a su rol.</p>
              )}

              {tenants.isSuccess && (
                <ul className="flex flex-col" aria-label="Empresas disponibles">
                  {visible.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active?.id === t.id}
                        onClick={() => pick(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{t.legalName}</span>
                            {t.qaSynthetic && DevParts && (
                              <Suspense fallback={null}>
                                <DevParts part="badge" />
                              </Suspense>
                            )}
                          </span>
                          <span className="block truncate font-mono text-xs text-ink-muted">{t.slug}</span>
                        </span>
                        {active?.id === t.id && <Check className="size-4 shrink-0 text-blue" aria-label="Empresa activa" />}
                      </button>
                    </li>
                  ))}
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
