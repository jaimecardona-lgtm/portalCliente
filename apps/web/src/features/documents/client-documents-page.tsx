/**
 * Documentos del cliente final (/documentos) en modo Supabase.
 *
 * Responsabilidad: listar documentos reales desde FastAPI, subir, abrir con enlace firmado temporal, reemplazar y
 * retirar. Solo los administradores del cliente ven los controles de escritura; el servidor vuelve a validar cada
 * acción. No hay datos de ejemplo: si no hay cliente asignado o documentos, la pantalla lo dice.
 * Restricciones: los documentos por operación dependen de la integración con Logixtic (no disponible): no se muestran
 * operaciones inventadas. Las URLs firmadas se abren y no se guardan.
 */
import { useContext, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, RefreshCw, Replace, Trash2, UploadCloud } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from '@/components/ui/primitives'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import {
  checkFileBeforeUpload,
  documentErrorMessage,
  type ClientAccess,
  type ClientDocument,
} from '@/services/api/documents-api'
import { useToast } from '@/components/ui/toast'

const ROLE_TEXT: Record<string, string> = {
  client_admin: 'Administrador del cliente: puede subir, reemplazar y retirar documentos.',
  client_viewer: 'Lector autorizado: puede consultar y descargar documentos.',
}

const dateFormat = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
})

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ClientDocumentsPage() {
  const portal = useContext(SupabasePortalContext)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const replaceInputs = useRef<Map<string, HTMLInputElement>>(new Map())

  const api = portal?.documents ?? null

  const access = useQuery({
    queryKey: ['supabase', 'client-access'],
    enabled: api !== null,
    retry: false,
    queryFn: () => api!.listClientAccess(),
  })

  const clients: ClientAccess[] = access.data ?? []
  const active = clients.find((c) => c.clientAccountId === selectedClientId) ?? clients[0] ?? null

  const docs = useQuery({
    queryKey: ['supabase', 'client-documents', active?.clientAccountId ?? null],
    enabled: api !== null && active !== null,
    retry: false,
    queryFn: () => api!.listClientDocuments(active!.clientAccountId),
  })

  const refresh = () => {
    if (active) void queryClient.invalidateQueries({ queryKey: ['supabase', 'client-documents', active.clientAccountId] })
  }

  const fail = (error: unknown) => {
    setFeedback({ kind: 'error', text: documentErrorMessage(error) })
  }

  const upload = useMutation({
    mutationFn: (file: File) => api!.uploadClientDocument(active!.clientAccountId, file),
    onSuccess: (doc) => {
      setFeedback({ kind: 'ok', text: `Documento subido: ${doc.fileName}.` })
      toast({ title: 'Documento subido' })
      refresh()
    },
    onError: fail,
  })

  const replace = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => api!.replaceDocument(id, file),
    onSuccess: (doc) => {
      setFeedback({ kind: 'ok', text: `Nueva versión publicada: ${doc.fileName} (versión ${doc.version}).` })
      refresh()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api!.removeDocument(id),
    onSuccess: () => {
      setConfirmRemoveId(null)
      setFeedback({ kind: 'ok', text: 'Documento retirado. Ya no está disponible para su cliente.' })
      refresh()
    },
    onError: fail,
  })

  const busy = upload.isPending || replace.isPending || remove.isPending

  const onPickUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !active) return
    const problem = checkFileBeforeUpload(file)
    if (problem) {
      setFeedback({ kind: 'error', text: problem })
      return
    }
    setFeedback(null)
    upload.mutate(file)
  }

  const onPickReplace = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = checkFileBeforeUpload(file)
    if (problem) {
      setFeedback({ kind: 'error', text: problem })
      return
    }
    setFeedback(null)
    replace.mutate({ id, file })
  }

  const openDocument = async (doc: ClientDocument) => {
    setFeedback(null)
    try {
      const link = await api!.getDownloadLink(doc.id)
      // La URL firmada se abre directamente; no se guarda en estado ni en almacenamiento del navegador.
      window.open(link.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      fail(error)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Documentos"
        description="Documentos de su cliente final. Los documentos ligados a operaciones aparecerán cuando la integración con Logixtic esté disponible."
      />

      {api === null && (
        <Card className="p-6">
          <p role="status" className="text-sm text-ink-soft">
            El acceso a documentos no está disponible en este momento. Contacte a su ejecutivo de cuenta.
          </p>
        </Card>
      )}

      {api !== null && access.isPending && <Skeleton className="h-40 w-full" />}

      {api !== null && access.isError && (
        <Card>
          <ErrorState message={documentErrorMessage(access.error)} onRetry={() => void access.refetch()} />
        </Card>
      )}

      {api !== null && access.isSuccess && clients.length === 0 && (
        <Card>
          <EmptyState
            icon={<FileText className="size-6" aria-hidden />}
            title="Sin cliente final asignado"
            description="Su cuenta no tiene un cliente final asignado en esta empresa. No hay documentos que mostrar."
          />
        </Card>
      )}

      {active && (
        <>
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              {clients.length > 1 ? (
                <label className="flex flex-col gap-1 text-sm text-ink-soft">
                  Cliente final
                  <select
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"
                    value={active.clientAccountId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value)
                      setFeedback(null)
                      setConfirmRemoveId(null)
                    }}
                  >
                    {clients.map((c) => (
                      <option key={c.clientAccountId} value={c.clientAccountId}>
                        {c.legalName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-base font-semibold text-ink">{active.legalName}</p>
              )}
              <p className="text-sm text-ink-soft">{ROLE_TEXT[active.role] ?? 'Acceso autorizado a este cliente.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={refresh} disabled={busy} aria-label="Actualizar lista">
                <RefreshCw className="size-4" aria-hidden /> Actualizar
              </Button>
              {active.canManage && (
                <>
                  <input
                    ref={uploadInput}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                    className="sr-only"
                    aria-label="Seleccionar documento para subir"
                    onChange={onPickUpload}
                  />
                  <Button size="sm" onClick={() => uploadInput.current?.click()} loading={upload.isPending} disabled={busy}>
                    <UploadCloud className="size-4" aria-hidden /> Subir documento
                  </Button>
                </>
              )}
            </div>
          </Card>

          {feedback && (
            <p
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={
                feedback.kind === 'error'
                  ? 'rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700'
                  : 'rounded-lg border border-line px-3 py-2.5 text-sm text-ink-soft'
              }
            >
              {feedback.text}
            </p>
          )}

          {docs.isPending && <Skeleton className="h-48 w-full" />}

          {docs.isError && (
            <Card>
              <ErrorState message={documentErrorMessage(docs.error)} onRetry={() => void docs.refetch()} />
            </Card>
          )}

          {docs.isSuccess && docs.data.length === 0 && (
            <Card>
              <EmptyState
                icon={<FileText className="size-6" aria-hidden />}
                title="Aún no hay documentos"
                description={
                  active.canManage
                    ? 'Suba el primer documento de su cliente final. Se admiten PDF, PNG, JPEG y XLSX de hasta 5 MB.'
                    : 'Su cliente final no tiene documentos disponibles.'
                }
              />
            </Card>
          )}

          {docs.isSuccess && docs.data.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Documento</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Tamaño</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Versión</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Actualizado</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.data.map((doc) => (
                    <tr key={doc.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{doc.fileName}</td>
                      <td className="px-4 py-3 text-ink-soft">{formatBytes(doc.sizeBytes)}</td>
                      <td className="px-4 py-3 text-ink-soft">{doc.version}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {doc.updatedAt ? dateFormat.format(new Date(doc.updatedAt)) : 'Sin cambios'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => void openDocument(doc)} disabled={busy}>
                            <Download className="size-4" aria-hidden /> Abrir
                          </Button>
                          {active.canManage && (
                            <>
                              <input
                                ref={(el) => {
                                  if (el) replaceInputs.current.set(doc.id, el)
                                  else replaceInputs.current.delete(doc.id)
                                }}
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                                className="sr-only"
                                aria-label={`Seleccionar nueva versión de ${doc.fileName}`}
                                onChange={(e) => onPickReplace(doc.id, e)}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => replaceInputs.current.get(doc.id)?.click()}
                                disabled={busy}
                              >
                                <Replace className="size-4" aria-hidden /> Reemplazar
                              </Button>
                              {confirmRemoveId === doc.id ? (
                                <span className="flex flex-wrap items-center gap-2">
                                  <Button size="sm" variant="danger" onClick={() => remove.mutate(doc.id)} loading={remove.isPending}>
                                    Sí, retirar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(null)} disabled={busy}>
                                    Cancelar
                                  </Button>
                                </span>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(doc.id)} disabled={busy}>
                                  <Trash2 className="size-4" aria-hidden /> Retirar
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
