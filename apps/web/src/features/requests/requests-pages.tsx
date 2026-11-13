/**
 * Solicitudes: historial (/solicitudes) y formulario de nueva solicitud (/solicitudes/nueva).
 *
 * Validación: requestSchema (Zod) fija asunto de 5 a 120 caracteres y descripción de 20 a 2000. El servidor
 * debe validar de nuevo.
 * Adjuntos: se seleccionan y se validan tipo y tamaño en el cliente (máximo 3 archivos de 5 MB). Aún no se
 * suben: se incorporarán con la integración documental (ver docs/ENTREGA_TECNICA_ENRIQUE.md).
 * Fuera de desarrollo, el formulario se sustituye por un aviso de función no disponible.
 */
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, MessageSquarePlus, Paperclip, Inbox, Send } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useActiveStaffTenant } from '@/services/auth/staff-context'
import { StaffModuleNotice } from '@/features/support/staff-module-notice'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useToast } from '@/components/ui/toast'
import { FEATURES } from '@/config/runtime'
import { Badge, Button, Card, EmptyState, ErrorState, Field, inputClass, Skeleton, type Tone } from '@/components/ui/primitives'
import { formatDateTime, cn } from '@/lib/format'
import type { RequestStatus, RequestType } from '@/types/domain'

const REQUEST_TYPES: RequestType[] = ['Consulta', 'Modificación de datos', 'Documentación', 'Cotización', 'Otro']

const STATUS_TONE: Record<RequestStatus, Tone> = {
  Recibida: 'info',
  'En revisión': 'warning',
  Respondida: 'success',
  Cerrada: 'neutral',
}

const MAX_FILE_MB = 5
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

export const requestSchema = z.object({
  type: z.enum(REQUEST_TYPES as [RequestType, ...RequestType[]], { message: 'Seleccione un tipo.' }),
  subject: z
    .string()
    .trim()
    .min(5, 'El asunto debe tener al menos 5 caracteres.')
    .max(120, 'El asunto no puede superar 120 caracteres.'),
  description: z
    .string()
    .trim()
    .min(20, 'Describa la solicitud con al menos 20 caracteres.')
    .max(2000, 'La descripción no puede superar 2000 caracteres.'),
  operationId: z.string().optional(),
})

export type RequestFormValues = z.infer<typeof requestSchema>

export function RequestsListPage() {
  const repo = useRepository()
  const { session, staff } = useSession()
  const activeStaff = useActiveStaffTenant()
  const staffView = session === null && staff !== null
  const tenantId = session?.tenantId ?? ''
  const requests = useQuery({ queryKey: tenantKey(tenantId, 'requests'), queryFn: () => repo.listRequests(tenantId), enabled: Boolean(tenantId) })
  const operations = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId) })
  const opNumber = (id: string | null) => (id ? operations.data?.find((o) => o.id === id)?.doNumber ?? '—' : '—')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Atención al cliente</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Solicitudes</h1>
          <p className="mt-1 text-sm text-ink-muted">Consultas, documentación y cambios de datos con su equipo.</p>
        </div>
        <Link to="/solicitudes/nueva" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-navy">
          <MessageSquarePlus className="size-4" aria-hidden /> Nueva solicitud
        </Link>
      </header>

      {requests.isError && <Card><ErrorState message="No se pudieron cargar las solicitudes." onRetry={() => void requests.refetch()} /></Card>}

      {requests.isPending && (staffView ? (
        <Card><StaffModuleNotice noun="solicitudes" hasContext={Boolean(activeStaff)} /></Card>
      ) : (
        <Card className="flex flex-col gap-3 p-4" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></Card>
      ))}

      {requests.data && requests.data.length === 0 && (
        <Card>
          <EmptyState icon={<Inbox className="size-6" />} title="Aún no tiene solicitudes" description="Cree una solicitud para consultar, pedir documentos o solicitar cambios." action={<Link to="/solicitudes/nueva" className="text-sm font-semibold text-blue hover:underline">Crear la primera</Link>} />
        </Card>
      )}

      {requests.data && requests.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Historial de solicitudes</caption>
              <thead className="bg-surface-muted/70 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">Número</th>
                  <th scope="col" className="px-3 py-3">Tipo</th>
                  <th scope="col" className="px-3 py-3">Asunto</th>
                  <th scope="col" className="px-3 py-3">DO relacionado</th>
                  <th scope="col" className="px-3 py-3">Estado</th>
                  <th scope="col" className="px-5 py-3">Actualizada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {requests.data.map((r) => (
                  <tr key={r.id} className="transition-colors duration-150 hover:bg-blue-50/40">
                    <td className="px-5 py-3 font-mono font-semibold text-ink">{r.number}</td>
                    <td className="px-3 py-3 text-ink-soft">{r.type}</td>
                    <td className="max-w-[280px] px-3 py-3"><span className="block truncate font-medium text-ink">{r.subject}</span></td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{opNumber(r.operationId)}</td>
                    <td className="px-3 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                    <td className="px-5 py-3 text-ink-muted tabular whitespace-nowrap">{formatDateTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

export function NewRequestPage() {
  const repo = useRepository()
  const { session, user } = useSession()
  const tenantId = session?.tenantId ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const operations = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId) })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { type: 'Consulta', subject: '', description: '', operationId: '' },
  })
  const description = watch('description') ?? ''

  const onFiles = (list: FileList | null) => {
    setFileError(null)
    if (!list) return
    const next: File[] = []
    for (const f of Array.from(list)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError(`"${f.name}" no es un formato permitido (PDF, PNG, JPG o XLSX).`)
        return
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setFileError(`"${f.name}" supera ${MAX_FILE_MB} MB.`)
        return
      }
      next.push(f)
    }
    if (files.length + next.length > 3) {
      setFileError('Puede adjuntar hasta 3 archivos.')
      return
    }
    setFiles((prev) => [...prev, ...next])
  }

  const onSubmit = async (values: RequestFormValues) => {
    setSubmitError(null)
    if (!user) return
    try {
      const created = await repo.createRequest(tenantId, {
        type: values.type,
        subject: values.subject,
        description: values.description,
        operationId: values.operationId ? values.operationId : null,
        // Los archivos seleccionados aún no se suben en este entorno.
        attachmentIds: [],
        createdBy: user.id,
      })
      await queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'requests') })
      toast({ title: 'Solicitud registrada', description: `${created.number} · registrada en el entorno local.` })
      void navigate({ to: '/solicitudes' })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.')
    }
  }

  if (!FEATURES.requestSubmission) return <RequestUnavailable />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Volver">
        <Link to="/solicitudes" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-blue">
          <ArrowLeft className="size-4" aria-hidden /> Solicitudes
        </Link>
      </nav>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Nueva solicitud</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">¿En qué podemos ayudarle?</h1>
        <p className="mt-1 text-sm text-ink-muted">Los campos marcados con * son obligatorios.</p>
      </header>

      <Card className="p-5 sm:p-7">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tipo de solicitud *" htmlFor="req-type" error={errors.type?.message}>
              <select id="req-type" className={inputClass} aria-invalid={Boolean(errors.type)} {...register('type')}>
                {REQUEST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Operación relacionada (DO)" htmlFor="req-op" hint="Opcional">
              <select id="req-op" className={inputClass} {...register('operationId')}>
                <option value="">Ninguna</option>
                {(operations.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.doNumber} · {o.reference}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Asunto *" htmlFor="req-subject" error={errors.subject?.message} hint="Resuma la solicitud en una frase.">
            <input id="req-subject" className={inputClass} aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'req-subject-error' : undefined} {...register('subject')} />
          </Field>

          <Field label="Descripción *" htmlFor="req-desc" error={errors.description?.message} hint={`${description.trim().length}/2000 caracteres · mínimo 20`}>
            <textarea id="req-desc" rows={5} className={cn(inputClass, 'h-auto py-2.5')} aria-invalid={Boolean(errors.description)} {...register('description')} />
          </Field>

          <div className="flex flex-col gap-2">
            <label htmlFor="req-files" className="text-sm font-medium text-ink">Adjuntos <span className="font-normal text-ink-muted">(opcional, máximo 3)</span></label>
            <label htmlFor="req-files" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line-strong bg-canvas px-4 py-4 text-sm text-ink-soft transition-colors duration-200 hover:border-blue hover:bg-blue-50/40">
              <Paperclip className="size-4 text-blue" aria-hidden />
              Seleccionar archivos · PDF, PNG, JPG o XLSX · máx. {MAX_FILE_MB} MB c/u · se incorporarán con la integración documental
              <input id="req-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {fileError && <p role="alert" className="text-xs text-danger-700">{fileError}</p>}
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs text-ink-soft">
                    <span className="max-w-[200px] truncate">{f.name}</span>
                    <button type="button" aria-label={`Quitar ${f.name}`} className="rounded px-1 text-ink-muted hover:text-danger-700" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {submitError && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{submitError}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Link to="/solicitudes" className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted">Cancelar</Link>
            <Button type="submit" loading={isSubmitting}><Send className="size-4" aria-hidden /> Enviar solicitud</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/** Envío de solicitudes aún no disponible: se orienta al cliente a su ejecutivo de cuenta. */
function RequestUnavailable() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <nav aria-label="Volver">
        <Link to="/solicitudes" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-blue">
          <ArrowLeft className="size-4" aria-hidden /> Solicitudes
        </Link>
      </nav>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-ink">Nueva solicitud</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          El envío de solicitudes desde el portal estará disponible próximamente. Mientras tanto, contacta a tu ejecutivo de cuenta para cualquier consulta o cambio.
        </p>
      </Card>
    </div>
  )
}
