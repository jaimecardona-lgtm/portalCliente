import { describe, it, expect, vi } from 'vitest'
import { PortalApiError } from './http-client'
import {
  checkFileBeforeUpload,
  createDocumentsApi,
  documentErrorMessage,
  toClientAccess,
  toClientDocument,
  MAX_DOCUMENT_BYTES,
} from './documents-api'

const BASE = 'https://api.prueba.test/api/v1'
const CLIENT = '3f9c1a2e-0000-4000-8000-0000000000c1'
const DOC = '3f9c1a2e-0000-4000-8000-0000000000d1'
const TOKEN = 'token-sintetico-de-prueba'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return handler(url, init ?? {})
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'poder.pdf', { type: 'application/pdf' })

describe('checkFileBeforeUpload (ayuda previa; el servidor decide)', () => {
  it('acepta un PDF pequeño', () => {
    expect(checkFileBeforeUpload({ name: 'poder.pdf', size: 10, type: 'application/pdf' })).toBeNull()
  })

  it('rechaza archivos vacíos, demasiado grandes, de tipo no admitido o con extensión incoherente', () => {
    expect(checkFileBeforeUpload({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toMatch(/vacío/)
    expect(checkFileBeforeUpload({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1, type: 'application/pdf' })).toMatch(/5 MB/)
    expect(checkFileBeforeUpload({ name: 'a.html', size: 10, type: 'text/html' })).toMatch(/no admitido/)
    expect(checkFileBeforeUpload({ name: 'a.exe', size: 10, type: 'application/pdf' })).toMatch(/extensión/)
  })
})

describe('documentErrorMessage (códigos reales del contrato)', () => {
  const cases: Array<[string, RegExp]> = [
    ['authentication_required', /sesión caducó/],
    ['role_cannot_manage_documents', /administrador del cliente/],
    ['client_not_found', /No encontramos/],
    ['document_not_found', /No encontramos/],
    ['document_changed', /cambió/],
    ['file_too_large', /5 MB/],
    ['unsupported_type', /no es válido/],
    ['content_mismatch', /no es válido/],
    ['file_empty', /vacío/],
    ['storage_not_configured', /no está disponible en este entorno/],
    ['storage_unavailable', /No se modificó nada/],
    ['persistence_failed', /No fue posible guardar/],
  ]
  it.each(cases)('%s tiene mensaje para la persona', (code, pattern) => {
    expect(documentErrorMessage(new PortalApiError(code, 'detalle técnico', 400))).toMatch(pattern)
  })

  it('no revela el mensaje técnico del servidor ni el código al usuario', () => {
    const text = documentErrorMessage(new PortalApiError('persistence_failed', 'SQL: INSERT INTO client_documents', 503))
    expect(text).not.toMatch(/INSERT|SQL|client_documents/)
  })

  it('un error desconocido o no controlado se presenta como conexión', () => {
    expect(documentErrorMessage(new TypeError('boom'))).toMatch(/conexión/)
  })
})

describe('createDocumentsApi', () => {
  it('sin token no hay petición de red', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(200, { items: [] }))
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => null, fetchImpl: fn })
    await expect(api.listClientAccess()).rejects.toMatchObject({ code: 'authentication_required', status: 401 })
    expect(calls).toHaveLength(0)
  })

  it('envía el JWT en Authorization y no envía credenciales de cookies', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(200, { items: [] }))
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await api.listClientAccess()
    expect(calls[0]?.url).toBe(`${BASE}/client-access`)
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]?.init.credentials).toBe('omit')
  })

  it('sube el archivo como cuerpo binario con Content-Type y X-File-Name codificado', async () => {
    const { fn, calls } = fakeFetch(() =>
      jsonResponse(201, {
        id: DOC,
        operation_id: null,
        client_account_id: CLIENT,
        file_name: 'Póliza 2026.pdf',
        mime_type: 'application/pdf',
        size_bytes: 5,
        sha256: 'a'.repeat(64),
        version: 1,
        status: 'available',
        updated_at: null,
      }),
    )
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    const doc = await api.uploadClientDocument(CLIENT, new File(['x'], 'Póliza 2026.pdf', { type: 'application/pdf' }))
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE}/client-accounts/${CLIENT}/documents`)
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/pdf')
    expect(headers['X-File-Name']).toBe(encodeURIComponent('Póliza 2026.pdf'))
    expect(calls[0]?.init.body).toBeInstanceOf(File)
    expect(doc.fileName).toBe('Póliza 2026.pdf')
  })

  it('traduce errores del servidor a PortalApiError con código, estado e identificador de petición', async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse(403, { error: { code: 'role_cannot_manage_documents', message: 'x', request_id: 'req-1' } }),
    )
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await expect(api.uploadClientDocument(CLIENT, pdf())).rejects.toMatchObject({
      code: 'role_cannot_manage_documents',
      status: 403,
      requestId: 'req-1',
    })
  })

  it('un error sin sobre de la API se trata como http_error', async () => {
    const { fn } = fakeFetch(() => new Response('<html>502</html>', { status: 502 }))
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await expect(api.listClientDocuments(CLIENT)).rejects.toMatchObject({ code: 'http_error', status: 502 })
  })

  it('un identificador que no es UUID no genera petición', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(200, {}))
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await expect(api.getDownloadLink('../../secreto')).rejects.toMatchObject({ code: 'not_found' })
    expect(calls).toHaveLength(0)
  })

  it('pide el enlace firmado y devuelve solo la URL temporal', async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse(200, { url: 'https://storage.prueba.test/object/sign/x?token=t', expires_in_seconds: 300 }),
    )
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await expect(api.getDownloadLink(DOC)).resolves.toEqual({
      url: 'https://storage.prueba.test/object/sign/x?token=t',
      expiresInSeconds: 300,
    })
  })

  it('retirar envía DELETE y devuelve el resultado de limpieza', async () => {
    const { fn, calls } = fakeFetch(() =>
      jsonResponse(200, { id: DOC, status: 'removed', storage_cleanup: 'pending' }),
    )
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl: fn })
    await expect(api.removeDocument(DOC)).resolves.toEqual({ id: DOC, status: 'removed', storageCleanup: 'pending' })
    expect(calls[0]?.init.method).toBe('DELETE')
  })

  it('un tiempo agotado se informa como timeout', async () => {
    const fetchImpl = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as unknown as typeof fetch
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl })
    await expect(api.listClientAccess()).rejects.toMatchObject({ code: 'timeout' })
  })

  it('un fallo de red se informa como network_error', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    const api = createDocumentsApi({ baseUrl: BASE, getToken: async () => TOKEN, fetchImpl })
    await expect(api.listClientAccess()).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('mapeo de respuestas', () => {
  it('rechaza respuestas con forma inesperada', () => {
    expect(() => toClientDocument({ id: DOC })).toThrow(PortalApiError)
    expect(() => toClientAccess({ client_account_id: CLIENT })).toThrow(PortalApiError)
  })

  it('solo es administrador quien tiene can_manage verdadero', () => {
    expect(toClientAccess({ client_account_id: CLIENT, legal_name: 'Cliente', role: 'client_viewer', can_manage: 'sí' }).canManage).toBe(false)
  })
})
