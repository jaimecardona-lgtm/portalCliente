/**
 * Documentos de la empresa confirmada por el personal interno.
 * El enlace firmado se abre y no se guarda.
 */
import { useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from '@/components/ui/primitives'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { useActiveStaffTenant } from '@/services/auth/staff-context'
import { QA_BANNER, staffErrorMessage, type StaffDocument } from '@/services/api/staff-api'
import { useSession } from '@/features/auth/session-context'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StaffDocumentsPanel() {
  const portal = useContext(SupabasePortalContext)
  const { session } = useSession()
  const activeStaff = useActiveStaffTenant()
  const tenantId = session?.tenantId ?? ''
  const api = portal?.staffApi ?? null
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const docs = useQuery({
    queryKey: ['staff', 'documents', tenantId],
    enabled: Boolean(api && tenantId),
    retry: false,
    queryFn: () => api!.documents(tenantId),
  })

  const openDocument = async (doc: StaffDocument) => {
    if (!api) return
    setDownloadError(null)
    try {
      const link = await api.documentLink(tenantId, doc.id)
      window.open(link.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setDownloadError(staffErrorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Documentos"
        description="Archivos registrados de la empresa confirmada. La descarga usa un enlace temporal."
      />
      {activeStaff?.qaSynthetic && (
        <p className="rounded-[var(--radius-card)] border border-warning-200 bg-warning-50 px-4 py-2 text-xs font-semibold text-ink">
          {QA_BANNER}
        </p>
      )}
      {!tenantId && (
        <Card className="p-6">
          <p className="text-sm text-ink-soft">Seleccione y confirme una empresa para ver sus documentos.</p>
        </Card>
      )}
      {docs.isPending && tenantId && <Skeleton className="h-40 w-full" />}
      {downloadError && <p role="alert" className="text-sm text-danger-700">{downloadError}</p>}
      {docs.isError && (
        <Card>
          <ErrorState message={staffErrorMessage(docs.error)} onRetry={() => void docs.refetch()} />
        </Card>
      )}
      {docs.data && docs.data.length === 0 && (
        <Card>
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Sin documentos"
            description="Esta empresa no tiene documentos registrados."
          />
        </Card>
      )}
      {docs.data && docs.data.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Documentos de la empresa</caption>
              <thead className="bg-surface-muted/70 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">Archivo</th>
                  <th scope="col" className="px-3 py-3">Versión</th>
                  <th scope="col" className="px-3 py-3">Tamaño</th>
                  <th scope="col" className="relative px-5 py-3 text-right">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {docs.data.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-5 py-3 font-medium text-ink">{doc.fileName}</td>
                    <td className="px-3 py-3 tabular">{doc.version}</td>
                    <td className="px-3 py-3 tabular">{formatBytes(doc.sizeBytes)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="secondary" onClick={() => void openDocument(doc)}>
                        <Download className="size-4" aria-hidden /> Descargar
                      </Button>
                    </td>
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
