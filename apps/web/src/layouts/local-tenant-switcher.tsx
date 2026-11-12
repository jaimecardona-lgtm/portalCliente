import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useRepository } from '@/services/repositories'
import { useToast } from '@/components/ui/toast'

/** Selector de empresa para QA local. Se carga solo en desarrollo (ver app-shell.tsx). */
export function LocalTenantSwitcher() {
  const { session, switchTenant } = useSession()
  const repo = useRepository()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: () => repo.listTenants(), staleTime: Infinity })

  return (
    <label className="hidden items-center gap-2 rounded-lg border border-warning/40 bg-warning-50 py-1 pr-1 pl-2.5 text-xs font-semibold text-warning-700 xl:flex">
      <FlaskConical className="size-3.5" aria-hidden />
      <span className="whitespace-nowrap">Entorno local</span>
      <span className="sr-only">Cambiar empresa</span>
      <select
        aria-label="Cambiar empresa (entorno local)"
        className="h-7 rounded-md border-0 bg-surface px-1.5 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
        value={session?.tenantId ?? ''}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true)
          try {
            await switchTenant(e.target.value)
            toast({ title: 'Empresa cambiada', description: 'La información mostrada corresponde a la empresa seleccionada.', tone: 'info' })
          } catch (err) {
            toast({ title: 'No se pudo cambiar la empresa', description: err instanceof Error ? err.message : undefined, tone: 'error' })
          } finally {
            setBusy(false)
          }
        }}
      >
        {(tenantsQuery.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.shortName}
          </option>
        ))}
      </select>
    </label>
  )
}

