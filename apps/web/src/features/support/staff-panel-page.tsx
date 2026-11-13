/**
 * Panel de soporte del personal interno (/soporte).
 *
 * Responsabilidad: mostrar el rol interno, listar solo las empresas verificadas y asignadas, fijar un contexto de
 * trabajo explícito, consultar sus operaciones y salir del contexto sin cerrar sesión.
 * Reglas: el servidor decide cada acceso. El contexto vive solo en memoria de esta pantalla (no en la URL ni en
 * almacenamiento del navegador). Sin datos de ejemplo: si no hay empresas verificadas o operaciones, la pantalla lo dice.
 */
import { useContext, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from '@/components/ui/primitives'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { QA_BANNER, staffErrorMessage, tenantCategory } from '@/services/api/staff-api'
import { StaffRecordsPanel } from '@/features/support/staff-records-panel'
import { PortalApiError } from '@/services/api/http-client'
import { setActiveStaffTenant, useActiveStaffTenant } from '@/services/auth/staff-context'

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Administrador de plataforma',
  qa: 'QA',
  developer: 'Desarrollo',
  support: 'Soporte',
}

const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })

export function StaffPanelPage() {
  const portal = useContext(SupabasePortalContext)
  const api = portal?.staff ?? null
  const queryClient = useQueryClient()
  // La empresa de trabajo se comparte con el selector del menú lateral (memoria de la pestaña).
  const active = useActiveStaffTenant()
  const [message, setMessage] = useState<string | null>(null)

  const me = useQuery({
    queryKey: ['supabase', 'staff-me'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.me(),
  })

  const tenants = useQuery({
    queryKey: ['supabase', 'staff-tenants'],
    enabled: me.isSuccess,
    retry: false,
    queryFn: () => api!.tenants(),
  })

  const operations = useQuery({
    queryKey: ['supabase', 'staff-operations', active?.id ?? null],
    enabled: api !== null && active !== null,
    retry: false,
    queryFn: () => api!.operations(active!.id),
  })

  const exit = async () => {
    setMessage(null)
    try {
      await api!.exitContext()
    } catch (error) {
      setMessage(staffErrorMessage(error))
      return
    }
    setActiveStaffTenant(null)
    queryClient.removeQueries({ queryKey: ['supabase', 'staff-operations'] })
  }

  const denied = me.isError && me.error instanceof PortalApiError && me.error.code === 'no_staff_role'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <SectionHeading title="Panel de soporte" description="Acceso interno por rol. Solo empresas asignadas a su rol." />

        {api === null && (
          <Card className="p-6">
            <p role="status" className="text-sm text-ink-soft">El panel no está disponible en este momento.</p>
          </Card>
        )}

        {api !== null && me.isPending && <Skeleton className="h-24 w-full" />}

        {denied && (
          <Card className="p-6">
            <EmptyState
              icon={<ShieldCheck className="size-6" aria-hidden />}
              title="Acceso no autorizado"
              description="Su cuenta no tiene un rol interno activo para este panel."
            />
          </Card>
        )}

        {api !== null && me.isError && !denied && (
          <Card>
            <ErrorState message={staffErrorMessage(me.error)} onRetry={() => void me.refetch()} />
          </Card>
        )}

        {me.isSuccess && (
          <>
            <Card className="flex flex-col gap-2 p-5">
              <p className="text-sm text-ink-soft">Rol interno</p>
              <p className="text-lg font-semibold text-ink">{ROLE_LABEL[me.data.staffRole] ?? 'Rol interno'}</p>
              <p className="text-sm text-ink-soft">
                Permisos: {me.data.permissions.length > 0 ? me.data.permissions.join(', ') : 'ninguno'}
              </p>
            </Card>

            {active && (
              <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Contexto activo">
                <div>
                  <p className="text-sm text-ink-soft">Contexto de trabajo</p>
                  <p className="font-semibold text-ink">{active.legalName}</p>
                  <p className="text-xs text-ink-muted">Identificador oficial: {active.externalTenantId ?? 'no disponible'}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void exit()}>
                  Salir del contexto
                </Button>
              </Card>
            )}

            {message && (
              <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{message}</p>
            )}

            <section aria-label="Empresas asignadas" className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-ink">Empresas asignadas</h2>
              {tenants.isPending && <Skeleton className="h-24 w-full" />}
              {tenants.isError && (
                <Card>
                  <ErrorState message={staffErrorMessage(tenants.error)} onRetry={() => void tenants.refetch()} />
                </Card>
              )}
              {tenants.isSuccess && tenants.data.length === 0 && (
                <Card>
                  <EmptyState
                    title="Sin empresas asignadas"
                    description="No hay empresas asignadas a su rol. Las empresas sin asignación no se muestran."
                  />
                </Card>
              )}
              {tenants.isSuccess && tenants.data.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {tenants.data.map((t) => {
                    const category = tenantCategory(t)
                    return (
                    <li key={t.id}>
                      <Card className="flex flex-col gap-3 p-4">
                        <div>
                          <p className="font-semibold text-ink">{t.legalName}</p>
                          <p className="text-xs text-ink-soft">
                            {category.officialIcon} {category.officialLabel}
                          </p>
                          {category.qaLabel && (
                            <p className="text-xs font-medium text-ink-soft">◇ {category.qaLabel}</p>
                          )}
                          <p className="text-xs text-ink-muted">
                            Identificador oficial: {t.externalTenantId ?? 'no disponible (pendiente de integración)'}
                          </p>
                        </div>
                        <p className="text-xs text-ink-muted">
                          {active?.id === t.id ? 'Contexto de trabajo activo' : 'Cambie de empresa desde el selector de la barra superior.'}
                        </p>
                      </Card>
                    </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {!active && (
              <Card>
                <EmptyState
                  title="Selecciona una empresa autorizada para consultar sus operaciones"
                  description="Hasta que elija una empresa verificada, este panel no consulta operaciones ni datos de empresa."
                />
              </Card>
            )}

            {active?.qaSynthetic && (
              <p role="note" className="rounded-lg border border-line-strong bg-surface-muted px-4 py-2.5 text-sm font-semibold text-ink">
                {QA_BANNER}
              </p>
            )}

            {active && api !== null && (
              <StaffRecordsPanel
                api={api}
                tenantId={active.id}
                canWrite={me.data.permissions.includes('records.write')}
              />
            )}

            {active && (
              <section aria-label="Operaciones de la empresa" className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-ink">Operaciones</h2>
                {operations.isPending && <Skeleton className="h-24 w-full" />}
                {operations.isError && (
                  <Card>
                    <ErrorState message={staffErrorMessage(operations.error)} onRetry={() => void operations.refetch()} />
                  </Card>
                )}
                {operations.isSuccess && operations.data.length === 0 && (
                  <Card>
                    <EmptyState
                      title="Esta empresa todavía no tiene operaciones registradas"
                      description="Las operaciones llegan desde Logixtic cuando la integración esté disponible. Puede registrar solicitudes y clientes desde el portal."
                    />
                  </Card>
                )}
                {operations.isSuccess && operations.data.length > 0 && (
                  <Card className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-line text-ink-muted">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">DO</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Referencia</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Sincronizada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operations.data.map((o) => (
                          <tr key={o.id} className="border-b border-line last:border-0">
                            <td className="px-4 py-3 font-medium text-ink">{o.doNumber}</td>
                            <td className="px-4 py-3 text-ink-soft">{o.reference ?? '—'}</td>
                            <td className="px-4 py-3 text-ink-soft">{o.lastKnownStatus ?? 'Sin estado'}</td>
                            <td className="px-4 py-3 text-ink-soft">
                              {o.lastSyncedAt ? dateFormat.format(new Date(o.lastSyncedAt)) : 'Sin fecha'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </section>
            )}
          </>
        )}
    </div>
  )
}
