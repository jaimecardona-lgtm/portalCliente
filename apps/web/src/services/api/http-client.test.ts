import { describe, it, expect, vi } from 'vitest'
import { apiRootFor, createApiClient, errorFromPayload, normalizeBaseUrl, PortalApiError } from './http-client'

const BASE = 'https://api.portal.test'

function fakeResponse(status: number, body?: unknown, raw?: string): Response {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body))
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response
}

describe('normalizeBaseUrl', () => {
  it('quita barras finales y conserva origen y ruta', () => {
    expect(normalizeBaseUrl(' https://api.portal.test/ ')).toBe('https://api.portal.test')
    expect(normalizeBaseUrl('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000')
  })

  it('rechaza esquemas distintos de http y https', () => {
    expect(() => normalizeBaseUrl('ftp://api.portal.test')).toThrow(PortalApiError)
    expect(() => normalizeBaseUrl('javascript:alert(1)')).toThrow(PortalApiError)
  })

  it('acepta una ruta relativa del mismo origen', () => {
    expect(normalizeBaseUrl('/api/v1')).toBe('/api/v1')
    expect(normalizeBaseUrl('/api/v1/')).toBe('/api/v1')
  })

  it('no permite protocolo relativo ni credenciales en rutas', () => {
    expect(() => normalizeBaseUrl('//otro.test/api/v1')).toThrow(PortalApiError)
    expect(() => normalizeBaseUrl('/api@otro.test')).toThrow(PortalApiError)
  })

  it('apiRootFor añade /api/v1 una sola vez', () => {
    expect(apiRootFor('https://api.portal.test')).toBe('https://api.portal.test/api/v1')
    expect(apiRootFor('/api/v1')).toBe('/api/v1')
    expect(apiRootFor('https://api.portal.test/api/v1')).toBe('https://api.portal.test/api/v1')
  })

  it('rechaza URLs con credenciales embebidas y valores que no son URL', () => {
    expect(() => normalizeBaseUrl('https://usuario:clave@api.portal.test')).toThrow(PortalApiError)
    expect(() => normalizeBaseUrl('no es una url')).toThrow(PortalApiError)
  })
})

describe('createApiClient', () => {
  it('envía Bearer, sin cookies y sin X-Tenant-Id cuando no se eligió empresa', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(200, { ok: true }))
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 'token-sintetico', fetchImpl })

    await client.get('/me')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/me`)
    expect(init.credentials).toBe('omit')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-sintetico')
    expect(headers['X-Tenant-Id']).toBeUndefined()
  })

  it('envía X-Tenant-Id solo cuando se indica empresa y serializa el cuerpo en JSON', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(201, { id: 'c1' }))
    const client = createApiClient({
      baseUrl: BASE,
      getToken: async () => 'token-sintetico',
      tenantId: '11111111-1111-4111-8111-111111111111',
      fetchImpl,
    })

    await client.post('/operations/x/events/y/comments', { body: 'Hola' })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Tenant-Id']).toBe('11111111-1111-4111-8111-111111111111')
    expect(headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ body: 'Hola' }))
  })

  it('sin token responde 401 local y no hace ninguna petición', async () => {
    const fetchImpl = vi.fn()
    const client = createApiClient({ baseUrl: BASE, getToken: async () => null, fetchImpl })

    await expect(client.get('/me')).rejects.toMatchObject({ code: 'authentication_required', status: 401 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('convierte el sobre de error de la API en PortalApiError con código y request id', async () => {
    const fetchImpl = async () =>
      fakeResponse(403, {
        error: { code: 'tenant_not_authorized', message: 'No tiene acceso.', request_id: 'req-123456' },
      })
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 't', fetchImpl })

    const error = await client.get('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PortalApiError)
    expect(error).toMatchObject({ code: 'tenant_not_authorized', status: 403, requestId: 'req-123456' })
  })

  it('un error sin sobre válido usa el código genérico http_error', async () => {
    const fetchImpl = async () => fakeResponse(502, undefined, '<html>Bad gateway</html>')
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 't', fetchImpl })

    await expect(client.get('/me')).rejects.toMatchObject({ code: 'http_error', status: 502 })
  })

  it('un fallo de red se informa como network_error sin detalles técnicos', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 't', fetchImpl })

    const error = await client.get('/me').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'network_error', status: 0 })
    expect((error as Error).message).not.toContain('Failed to fetch')
  })

  it('una respuesta 200 que no es JSON se rechaza como invalid_response', async () => {
    const fetchImpl = async () => fakeResponse(200, undefined, 'no es json')
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 't', fetchImpl })

    await expect(client.get('/me')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('aplica tiempo de espera y lo informa como timeout', async () => {
    const fetchImpl = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    const client = createApiClient({ baseUrl: BASE, getToken: async () => 't', fetchImpl, timeoutMs: 5 })

    await expect(client.get('/me')).rejects.toMatchObject({ code: 'timeout', status: 0 })
  })
})

describe('errorFromPayload', () => {
  it('ignora sobres con tipos incorrectos', () => {
    expect(errorFromPayload(400, { error: { code: 7 } })).toMatchObject({ code: 'http_error', status: 400 })
    expect(errorFromPayload(400, null)).toMatchObject({ code: 'http_error' })
  })
})
