/**
 * Registros creados desde el portal para la empresa de trabajo (solicitudes y clientes finales).
 *
 * Responsabilidad: listar y crear registros con procedencia 'portal_manual' en la empresa seleccionada.
 * Reglas: el servidor valida permisos, asignación y tenant seleccionado; aquí solo se validan longitudes para
 * dar un mensaje claro antes de enviar. Sin datos de ejemplo: una empresa nueva muestra estados vacíos.
 * No se sincroniza nada hacia Logixtic desde estos formularios.
 */
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, EmptyState, ErrorState, Field, Skeleton, inputClass } from '@/components/ui/primitives'
import { REQUEST_TYPES, staffErrorMessage, type StaffApi } from '@/services/api/staff-api'

interface Props {
  api: StaffApi
  tenantId: string
  canWrite: boolean
}

const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' })

export function StaffRecordsPanel({ api, tenantId, canWrite }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <RequestsSection api={api} tenantId={tenantId} canWrite={canWrite} />
      <ClientAccountsSection api={api} tenantId={tenantId} canWrite={canWrite} />
    </div>
  )
}

function RequestsSection({ api, tenantId, canWrite }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [requestType, setRequestType] = useState<string>(REQUEST_TYPES[0].value)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['supabase', 'staff-requests', tenantId],
    retry: false,
    queryFn: () => api.requests(tenantId),
  })

  const create = useMutation({
    mutationFn: () => api.createRequest(tenantId, { requestType, subject: subject.trim(), description: description.trim() }),
    onSuccess: (item) => {
      setSaved(`Solicitud ${item.number} registrada.`)
      setSubject('')
      setDescription('')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['supabase', 'staff-requests', tenantId] })
    },
    onError: (e) => setError(staffErrorMessage(e)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(null)
    if (subject.trim().length < 5) return setError('El asunto debe tener al menos 5 caracteres.')
    if (description.trim().length < 20) return setError('La descripción debe tener al menos 20 caracteres.')
    create.mutate()
  }

  return (
    <section aria-label="Solicitudes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Solicitudes</h2>
        {canWrite && !open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Crear solicitud
          </Button>
        )}
      </div>

      {saved && <p role="status" className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink">{saved}</p>}

      {canWrite && open && (
        <Card className="p-5">
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <Field label="Tipo" htmlFor="staff-request-type">
              <select id="staff-request-type" className={inputClass} value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                {REQUEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Asunto" htmlFor="staff-request-subject" hint="Entre 5 y 120 caracteres.">
              <input id="staff-request-subject" className={inputClass} value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Descripción" htmlFor="staff-request-description" hint="Entre 20 y 2000 caracteres.">
              <textarea
                id="staff-request-description"
                className={`${inputClass} h-28 py-2`}
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={create.isPending}>Guardar solicitud</Button>
              <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setError(null) }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {list.isPending && <Skeleton className="h-20 w-full" />}
      {list.isError && (
        <Card>
          <ErrorState message={staffErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        </Card>
      )}
      {list.isSuccess && list.data.length === 0 && (
        <Card>
          <EmptyState title="Sin solicitudes" description="Esta empresa todavía no tiene solicitudes registradas." />
        </Card>
      )}
      {list.isSuccess && list.data.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Número</th>
                <th scope="col" className="px-4 py-3 font-semibold">Asunto</th>
                <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-3 font-semibold">Creada</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.number}</td>
                  <td className="px-4 py-3 text-ink">{r.subject}</td>
                  <td className="px-4 py-3 text-ink-soft">Recibida · Creada en el portal</td>
                  <td className="px-4 py-3 text-ink-soft">{dateFormat.format(new Date(r.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}

function ClientAccountsSection({ api, tenantId, canWrite }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['supabase', 'staff-client-accounts', tenantId],
    retry: false,
    queryFn: () => api.clientAccounts(tenantId),
  })

  const create = useMutation({
    mutationFn: () => api.createClientAccount(tenantId, { legalName: legalName.trim(), taxId: taxId.trim() || undefined }),
    onSuccess: (item) => {
      setSaved(`Cliente final «${item.legalName}» registrado.`)
      setLegalName('')
      setTaxId('')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['supabase', 'staff-client-accounts', tenantId] })
    },
    onError: (e) => setError(staffErrorMessage(e)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(null)
    if (legalName.trim().length < 2) return setError('El nombre legal debe tener al menos 2 caracteres.')
    if (taxId.trim() && taxId.trim().length < 3) return setError('El NIT, si se indica, debe tener al menos 3 caracteres.')
    create.mutate()
  }

  return (
    <section aria-label="Clientes finales" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Clientes finales</h2>
        {canWrite && !open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Crear cliente final
          </Button>
        )}
      </div>

      {saved && <p role="status" className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink">{saved}</p>}

      {canWrite && open && (
        <Card className="p-5">
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <Field label="Nombre legal" htmlFor="staff-client-name" hint="Entre 2 y 200 caracteres.">
              <input id="staff-client-name" className={inputClass} value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
            <Field label="NIT (opcional)" htmlFor="staff-client-tax" hint="Solo si lo aporta el cliente.">
              <input id="staff-client-tax" className={inputClass} value={taxId} maxLength={40} onChange={(e) => setTaxId(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={create.isPending}>Guardar cliente</Button>
              <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setError(null) }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {list.isPending && <Skeleton className="h-20 w-full" />}
      {list.isError && (
        <Card>
          <ErrorState message={staffErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        </Card>
      )}
      {list.isSuccess && list.data.length === 0 && (
        <Card>
          <EmptyState title="Sin clientes finales" description="Esta empresa todavía no tiene clientes finales registrados." />
        </Card>
      )}
      {list.isSuccess && list.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.data.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-col gap-1 p-4">
                <p className="font-semibold text-ink">{c.legalName}</p>
                <p className="text-xs text-ink-muted">NIT: {c.taxId ?? 'no indicado'} · Creado en el portal</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
