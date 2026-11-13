import { describe, it, expect, vi } from 'vitest'
import { createStaffApi, tenantCategory, toStaffTenant } from './staff-api'

const BASE = 'https://api.prueba.test/api/v1'
const TENANT = '3f9c1a2e-0000-4000-8000-0000000000e1'
const RECORD = '3f9c1a2e-0000-4000-8000-0000000000a1'

function fake(body: unknown, status = 201) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

describe('categoría de empresa en el selector', () => {
  it('distingue vinculada, pendiente y demostración con texto', () => {
    expect(tenantCategory({ isDemo: false, integrationStatus: 'verified' }).label).toBe('Empresa vinculada con Logixtic')
    expect(tenantCategory({ isDemo: false, integrationStatus: 'pending_integration' }).label).toBe(
      'Registrada, pendiente de integración',
    )
    expect(tenantCategory({ isDemo: true, integrationStatus: 'pending_integration' }).label).toBe('Empresa de ejemplo')
  })

  it('sin estado explícito del servidor, la empresa se trata como pendiente (nunca como vinculada)', () => {
    const t = toStaffTenant({ id: TENANT, slug: 'x-prueba', legal_name: 'Empresa de prueba', external_tenant_id: null })
    expect(t.integrationStatus).toBe('pending_integration')
    expect(t.isDemo).toBe(false)
    expect(t.discoveryObservedLabel).toBeNull()
  })
})

describe('registros creados desde el portal', () => {
  it('crea una solicitud con cuerpo en snake_case y solo los campos permitidos', async () => {
    const f = fake({
      item: {
        id: RECORD,
        tenant_id: TENANT,
        number: 'SOL-261113-0001',
        request_type: 'consulta',
        subject: 'Consulta de prueba',
        description: 'Descripción sintética suficientemente larga.',
        status: 'recibida',
        origin: 'portal_manual',
        created_at: '2026-11-13T12:00:00Z',
      },
    })
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    const item = await api.createRequest(TENANT, {
      requestType: 'consulta',
      subject: 'Consulta de prueba',
      description: 'Descripción sintética suficientemente larga.',
    })
    expect(item.origin).toBe('portal_manual')
    expect(item.number).toBe('SOL-261113-0001')
    expect(f.calls[0]?.url).toBe(`${BASE}/staff/tenants/${TENANT}/requests`)
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({
      request_type: 'consulta',
      subject: 'Consulta de prueba',
      description: 'Descripción sintética suficientemente larga.',
    })
  })

  it('no envía el NIT de un cliente final cuando no se indica', async () => {
    const f = fake({
      item: {
        id: RECORD,
        tenant_id: TENANT,
        legal_name: 'Cliente Final Ficticio S.A.S.',
        tax_id: null,
        status: 'active',
        origin: 'portal_manual',
        created_at: '2026-11-13T12:00:00Z',
      },
    })
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    const item = await api.createClientAccount(TENANT, { legalName: 'Cliente Final Ficticio S.A.S.' })
    expect(item.taxId).toBeNull()
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({ legal_name: 'Cliente Final Ficticio S.A.S.' })
  })

  it('un identificador de empresa no UUID no genera petición de escritura', async () => {
    const f = fake({})
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    await expect(
      api.createRequest('no-es-uuid', { requestType: 'consulta', subject: 'Asunto válido', description: 'Descripción válida de prueba.' }),
    ).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
  })
})
