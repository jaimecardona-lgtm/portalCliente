/**
 * Cliente HTTP de documentos de cliente final (contrato de FastAPI, sin endpoints alternativos).
 *
 * Responsabilidad: enviar el token de Supabase, subir el archivo como cuerpo binario con Content-Type y
 * X-File-Name, pedir enlaces firmados y traducir los errores del servidor a mensajes para la persona.
 * Reglas:
 * - Sin token no hay petición. El navegador nunca elige bucket ni ruta.
 * - El nombre de archivo viaja codificado (percent-encoding) porque las cabeceras HTTP solo admiten Latin-1.
 * - La validación previa del archivo es solo una ayuda de interfaz: el servidor decide.
 * - Ninguna URL firmada se guarda en el almacenamiento del navegador ni en la caché de la aplicación.
 */
import { PortalApiError } from './http-client'
import { assertUuid, createAuthedRequester, type AuthedMethod } from './authed-request'

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

/** Tipos admitidos por el servidor (lista blanca). La validación real la hace FastAPI. */
export const ALLOWED_DOCUMENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

export interface ClientAccess {
  clientAccountId: string
  legalName: string
  role: string
  canManage: boolean
}

export interface ClientDocument {
  id: string
  operationId: string | null
  clientAccountId: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  version: number
  status: string
  updatedAt: string | null
}

export interface DownloadLink {
  url: string
  expiresInSeconds: number
}

export interface DocumentsApi {
  listClientAccess(): Promise<ClientAccess[]>
  listClientDocuments(clientAccountId: string): Promise<ClientDocument[]>
  uploadClientDocument(clientAccountId: string, file: File): Promise<ClientDocument>
  replaceDocument(documentId: string, file: File): Promise<ClientDocument>
  removeDocument(documentId: string): Promise<{ id: string; status: string; storageCleanup: string }>
  getDownloadLink(documentId: string): Promise<DownloadLink>
}

export interface DocumentsApiOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}


/** Validación previa de ayuda: devuelve el mensaje o null. El servidor siempre tiene la última palabra. */
export function checkFileBeforeUpload(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return 'El archivo está vacío.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera el tamaño máximo de 5 MB.'
  if (!(file.type in ALLOWED_DOCUMENT_TYPES)) return 'Tipo de archivo no admitido. Se admiten PDF, PNG, JPEG y XLSX.'
  const lower = file.name.toLowerCase()
  const extensions = ALLOWED_DOCUMENT_TYPES[file.type] ?? []
  if (!extensions.some((ext) => lower.endsWith(ext))) {
    return 'La extensión del archivo no corresponde a su tipo.'
  }
  return null
}

/** Mensaje para la persona según el código de error del servidor. Nunca muestra detalles técnicos. */
export function documentErrorMessage(error: unknown): string {
  if (!(error instanceof PortalApiError)) return 'No hay conexión con el servidor. Inténtelo de nuevo.'
  switch (error.code) {
    case 'authentication_required':
    case 'invalid_token':
      return 'Su sesión caducó. Inicie sesión de nuevo para continuar.'
    case 'role_cannot_manage_documents':
      return 'Solo un administrador del cliente puede gestionar documentos.'
    case 'client_not_found':
    case 'document_not_found':
    case 'operation_not_found':
      return 'No encontramos este documento o cliente. Puede que ya no esté disponible.'
    case 'document_changed':
      return 'El documento cambió mientras lo modificaba. Actualice la lista y vuelva a intentarlo.'
    case 'file_too_large':
      return 'El archivo supera el tamaño máximo de 5 MB.'
    case 'unsupported_type':
    case 'extension_mismatch':
    case 'content_mismatch':
      return 'El archivo no es válido para su tipo. Se admiten PDF, PNG, JPEG y XLSX.'
    case 'file_empty':
    case 'invalid_file_name':
      return 'El archivo está vacío o su nombre no es válido.'
    case 'storage_not_configured':
      return 'El almacenamiento de documentos no está disponible en este entorno.'
    case 'storage_unavailable':
      return 'El almacenamiento no respondió. No se modificó nada; inténtelo de nuevo.'
    case 'persistence_failed':
      return 'No fue posible guardar el documento. Inténtelo de nuevo.'
    case 'timeout':
      return 'La operación tardó demasiado. Inténtelo de nuevo.'
    case 'network_error':
      return 'No hay conexión con el servidor. Inténtelo de nuevo.'
    default:
      return 'No fue posible completar la operación. Inténtelo de nuevo.'
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new PortalApiError('invalid_response', `Respuesta no válida: ${field}.`, 200)
  return value
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PortalApiError('invalid_response', `Respuesta no válida: ${field}.`, 200)
  }
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function toClientAccess(raw: unknown): ClientAccess {
  const r = raw as Record<string, unknown>
  return {
    clientAccountId: requireString(r.client_account_id, 'client_account_id'),
    legalName: requireString(r.legal_name, 'legal_name'),
    role: requireString(r.role, 'role'),
    canManage: r.can_manage === true,
  }
}

export function toClientDocument(raw: unknown): ClientDocument {
  const r = raw as Record<string, unknown>
  return {
    id: requireString(r.id, 'id'),
    operationId: nullableString(r.operation_id),
    clientAccountId: nullableString(r.client_account_id),
    fileName: requireString(r.file_name, 'file_name'),
    mimeType: requireString(r.mime_type, 'mime_type'),
    sizeBytes: requireNumber(r.size_bytes, 'size_bytes'),
    sha256: requireString(r.sha256, 'sha256'),
    version: requireNumber(r.version, 'version'),
    status: requireString(r.status, 'status'),
    updatedAt: nullableString(r.updated_at),
  }
}

export function createDocumentsApi(options: DocumentsApiOptions): DocumentsApi {
  const requester = createAuthedRequester({
    baseUrl: options.baseUrl,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  const send = (method: AuthedMethod, path: string, init?: { body?: BodyInit; headers?: Record<string, string> }) =>
    requester.send(method, path, init)

  function fileHeaders(file: File): Record<string, string> {
    return { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }
  }

  return {
    async listClientAccess() {
      const data = (await send('GET', '/client-access')) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toClientAccess)
    },

    async listClientDocuments(clientAccountId) {
      assertUuid(clientAccountId)
      const data = (await send('GET', `/client-accounts/${clientAccountId}/documents`)) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toClientDocument)
    },

    async uploadClientDocument(clientAccountId, file) {
      assertUuid(clientAccountId)
      const data = await send('POST', `/client-accounts/${clientAccountId}/documents`, {
        body: file,
        headers: fileHeaders(file),
      })
      return toClientDocument(data)
    },

    async replaceDocument(documentId, file) {
      assertUuid(documentId)
      const data = await send("PUT", `/documents/${documentId}/file`, { body: file, headers: fileHeaders(file) })
      // La respuesta de reemplazo no incluye cliente ni fecha: se completan con valores neutros.
      return toClientDocument({ ...(data as Record<string, unknown>), client_account_id: null, updated_at: null })
    },

    async removeDocument(documentId) {
      assertUuid(documentId)
      const data = (await send('DELETE', `/documents/${documentId}`)) as Record<string, unknown>
      return {
        id: requireString(data.id, 'id'),
        status: requireString(data.status, 'status'),
        storageCleanup: requireString(data.storage_cleanup, 'storage_cleanup'),
      }
    },

    async getDownloadLink(documentId) {
      assertUuid(documentId)
      const data = (await send('GET', `/documents/${documentId}/link`)) as Record<string, unknown>
      return {
        url: requireString(data.url, 'url'),
        expiresInSeconds: requireNumber(data.expires_in_seconds, 'expires_in_seconds'),
      }
    },
  }
}
