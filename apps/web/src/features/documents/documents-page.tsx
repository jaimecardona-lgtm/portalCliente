import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Eye, History, UploadCloud, FolderOpen, ChevronDown, FileCheck2 } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, type Tone, inputClass } from '@/components/ui/primitives'
import { cn, daysUntil, formatDate } from '@/lib/format'
import type { DocumentRecord, DocumentStatus } from '@/types/domain'
import { referenceNow } from '@/lib/clock'
import { FEATURES } from '@/config/runtime'

type Tab = 'all' | DocumentStatus
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'vigente', label: 'Vigentes' },
  { id: 'por_vencer', label: 'Próximos a vencer' },
  { id: 'vencido', label: 'Vencidos' },
]

const STATUS_TONE: Record<DocumentStatus, { label: string; tone: Tone }> = {
  vigente: { label: 'Vigente', tone: 'success' },
  por_vencer: { label: 'Por vencer', tone: 'warning' },
  vencido: { label: 'Vencido', tone: 'danger' },
}

export function DocumentsPage() {
  const repo = useRepository()
  const { session, user } = useSession()
  const tenantId = session?.tenantId ?? ''
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const now = useMemo(() => referenceNow(), [])

  const [tab, setTab] = useState<Tab>('all')
  const [term, setTerm] = useState('')
  const [category, setCategory] = useState('')
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [uploadFor, setUploadFor] = useState<DocumentRecord | null>(null)

  const docs = useQuery({ queryKey: tenantKey(tenantId, 'documents'), queryFn: () => repo.listDocuments(tenantId), enabled: Boolean(tenantId) })
  const attachments = useQuery({ queryKey: tenantKey(tenantId, 'attachments'), queryFn: () => repo.listAttachments(tenantId), enabled: Boolean(tenantId) })

  const categories = useMemo(() => [...new Set((docs.data ?? []).map((d) => d.category))].sort(), [docs.data])

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase()
    return (docs.data ?? [])
      .filter((d) => tab === 'all' || d.status === tab)
      .filter((d) => !category || d.category === category)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  }, [docs.data, tab, term, category])

  const counts = useMemo(() => {
    const all = docs.data ?? []
    return {
      all: all.length,
      vigente: all.filter((d) => d.status === 'vigente').length,
      por_vencer: all.filter((d) => d.status === 'por_vencer').length,
      vencido: all.filter((d) => d.status === 'vencido').length,
    } satisfies Record<Tab, number>
  }, [docs.data])

  const previewDoc = previewId ? docs.data?.find((d) => d.id === previewId) : undefined
  const previewAttachment = previewDoc?.attachmentId ? attachments.data?.find((a) => a.id === previewDoc.attachmentId) : undefined

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Cumplimiento</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Gestión documental</h1>
        <p className="mt-1 text-sm text-ink-muted">Vigencias y versiones de los documentos de su empresa. </p>
      </header>

      <Card className="p-3 sm:p-4">
        <div role="tablist" aria-label="Filtrar por estado documental" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
                tab === t.id ? 'bg-midnight text-white' : 'text-ink-soft hover:bg-surface-muted hover:text-ink',
              )}
            >
              {t.label}
              <span className={cn('rounded-md px-1.5 text-xs tabular', tab === t.id ? 'bg-white/15' : 'bg-surface-muted')}>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <label htmlFor="doc-search" className="sr-only">Buscar documento</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input id="doc-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nombre o categoría" className={cn(inputClass, 'pl-9')} />
          </div>
          <label className="sr-only" htmlFor="doc-cat">Categoría</label>
          <select id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </Card>

      {docs.isError && <Card><ErrorState message="No se pudieron cargar los documentos." onRetry={() => void docs.refetch()} /></Card>}

      {docs.isPending && (
        <Card className="flex flex-col gap-3 p-4" aria-busy="true">
          <Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" />
        </Card>
      )}

      {docs.data && filtered.length === 0 && (
        <Card>
          <EmptyState icon={<FolderOpen className="size-6" />} title="No hay documentos con este filtro" description="Cambie la pestaña o limpie la búsqueda." action={<Button variant="secondary" size="sm" onClick={() => { setTab('all'); setTerm(''); setCategory('') }}>Ver todos</Button>} />
        </Card>
      )}

      {filtered.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((doc) => {
              const meta = STATUS_TONE[doc.status]
              const days = daysUntil(doc.expiresAt, now)
              const expanded = openHistory === doc.id
              return (
                <li key={doc.id} className="p-4 sm:px-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{doc.name}</p>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">{doc.category} · Versión {doc.version}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:w-[300px] md:shrink-0">
                      <div><dt className="text-xs text-ink-muted">Vigencia desde</dt><dd className="tabular text-ink-soft">{formatDate(doc.validFrom)}</dd></div>
                      <div><dt className="text-xs text-ink-muted">Vence</dt><dd className={cn('tabular', doc.status === 'vencido' ? 'font-semibold text-danger-700' : 'text-ink-soft')}>{formatDate(doc.expiresAt)}{doc.status !== 'vencido' && <span className="ml-1 text-xs text-ink-muted">({days} d)</span>}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-2 md:shrink-0">
                      {FEATURES.documentPreview && (
                        <Button variant="secondary" size="sm" onClick={() => setPreviewId(doc.id)} disabled={!doc.attachmentId} title={doc.attachmentId ? undefined : 'Este documento aún no tiene archivo asociado'}>
                          <Eye className="size-3.5" aria-hidden /> Consultar archivo
                        </Button>
                      )}
                      {FEATURES.documentUpload && (
                        <Button variant="secondary" size="sm" onClick={() => setUploadFor(doc)}>
                          <UploadCloud className="size-3.5" aria-hidden /> Cargar actualización
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={`hist-${doc.id}`} onClick={() => setOpenHistory(expanded ? null : doc.id)}>
                        <History className="size-3.5" aria-hidden /> Historial
                        <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {expanded && (
                    <ol id={`hist-${doc.id}`} className="mt-4 space-y-2 border-l-2 border-line pl-4 animate-fade-in">
                      {doc.history.map((h) => (
                        <li key={h.version} className="text-sm">
                          <span className="font-semibold text-ink">Versión {h.version}</span>
                          <span className="text-ink-muted"> · {formatDate(h.uploadedAt)} · {h.uploadedBy}</span>
                          <p className="text-ink-soft">{h.note}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {previewDoc && (
        <Dialog title="Consultar archivo" onClose={() => setPreviewId(null)}>
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue"><FileCheck2 className="size-6" aria-hidden /></span>
            <div className="min-w-0">
              <p className="font-semibold text-ink break-all">{previewAttachment?.name ?? 'Archivo sin nombre'}</p>
              <p className="mt-1 text-sm text-ink-muted">{previewAttachment ? `${previewAttachment.sizeKb} KB · ${previewAttachment.mimeType}` : 'Sin metadatos'}</p>
              <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-soft">La vista previa estará disponible con la integración documental.</p>
            </div>
          </div>
        </Dialog>
      )}

      {uploadFor && (
        <UploadDialog
          doc={uploadFor}
          onClose={() => setUploadFor(null)}
          onUploaded={async (name, note) => {
            if (!user) return
            await repo.addDocumentVersion(tenantId, uploadFor.id, { fileName: name, note, uploadedBy: user.fullName })
            await queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'documents') })
            toast({ title: 'Actualización registrada', description: `${uploadFor.name} · nueva versión ${uploadFor.version + 1} registrada en el entorno local.` })
            setUploadFor(null)
          }}
        />
      )}
    </div>
  )
}

function UploadDialog({
  doc,
  onClose,
  onUploaded,
}: {
  doc: DocumentRecord
  onClose: () => void
  onUploaded: (fileName: string, note: string) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const MAX_MB = 10
  const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg']

  const submit = async () => {
    if (!file) return setError('Seleccione un archivo PDF, PNG o JPG.')
    if (!ACCEPT.includes(file.type)) return setError('Formato no permitido. Use PDF, PNG o JPG.')
    if (file.size > MAX_MB * 1024 * 1024) return setError(`El archivo supera ${MAX_MB} MB.`)
    setBusy(true)
    try {
      await onUploaded(file.name, note.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Actualizar · ${doc.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label
          htmlFor="doc-file"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-canvas px-4 py-7 text-center transition-colors duration-200 hover:border-blue hover:bg-blue-50/40"
        >
          <UploadCloud className="size-7 text-blue" aria-hidden />
          <span className="text-sm font-semibold text-ink">{file ? file.name : 'Seleccionar archivo'}</span>
          <span className="text-xs text-ink-muted">PDF, PNG o JPG · máximo {MAX_MB} MB</span>
          <input
            id="doc-file"
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-note" className="text-sm font-medium text-ink">Nota de la actualización</label>
          <textarea id="doc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} className={cn(inputClass, 'h-auto py-2')} placeholder="Ej. renovación anual" />
        </div>
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={() => void submit()}>Registrar versión</Button>
        </div>
      </div>
    </Dialog>
  )
}
