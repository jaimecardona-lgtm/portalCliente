import { describe, it, expect, vi } from 'vitest'
import { createLogixApi, answerKindLabel } from './logix-api'

const BASE = 'http://127.0.0.1:18020/api/v1'
const TENANT = '3f9c1a2e-0000-4000-8000-0000000000aa'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createLogixApi', () => {
  it('envía solo la pregunta y el identificador de la empresa activa, con el token', async () => {
    const fetchImpl = vi.fn(async () => json(200, { answer: 'Hola', answer_kind: 'model', tenant: null, sources: [] }))
    const api = createLogixApi({ baseUrl: BASE, getToken: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    const reply = await api.ask('¿Qué es un incoterm?', TENANT)
    expect(reply.answerKind).toBe('model')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/logix/chat`)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['X-Tenant-Id']).toBe(TENANT)
    expect(JSON.parse(String(init.body))).toEqual({ message: '¿Qué es un incoterm?' })
  })

  it('sin empresa no envía la cabecera de tenant', async () => {
    const fetchImpl = vi.fn(async () => json(200, { answer: 'x', answer_kind: 'unavailable', tenant: null, sources: [] }))
    const api = createLogixApi({ baseUrl: BASE, getToken: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    await api.ask('Hola', null)
    const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['X-Tenant-Id']).toBeUndefined()
  })

  it('rechaza una respuesta sin origen declarado en lugar de inventarla', async () => {
    const fetchImpl = vi.fn(async () => json(200, { answer: 'sin origen' }))
    const api = createLogixApi({ baseUrl: BASE, getToken: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(api.ask('Hola', TENANT)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('un 401 se propaga como error de sesión', async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: { code: 'invalid_token', message: 'x' } }))
    const api = createLogixApi({ baseUrl: BASE, getToken: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(api.ask('Hola', TENANT)).rejects.toMatchObject({ status: 401 })
  })
})

describe('origen de la respuesta', () => {
  it('nunca presenta una respuesta de proveedor fallido como IA conectada', () => {
    expect(answerKindLabel('provider_failure')).toMatch(/Problema temporal/)
    expect(answerKindLabel('unavailable')).toMatch(/no disponible/)
    expect(answerKindLabel('model')).toMatch(/IA/)
    expect(answerKindLabel('deterministic')).toMatch(/empresa activa/)
  })
})
