import { describe, it, expect, vi } from 'vitest'
import { createStaffApi, QA_BANNER, tenantCategory, toStaffTenant, toStaffTenantProfile } from './staff-api'

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
  it('separa la integración oficial de la disponibilidad QA', () => {
    const qaPendiente = tenantCategory({ integrationStatus: 'pending_integration', qaSynthetic: true })
    expect(qaPendiente.officialLabel).toBe('Integración oficial con Logixtic: pendiente')
    expect(qaPendiente.qaLabel).toBe('Disponible para revisión QA')
    expect(tenantCategory({ integrationStatus: 'verified', qaSynthetic: false }).qaLabel).toBeNull()
  })

  it('sin estado explícito del servidor, la empresa se trata como pendiente (nunca como vinculada)', () => {
    const t = toStaffTenant({ id: TENANT, slug: 'x-prueba', legal_name: 'Empresa de prueba', external_tenant_id: null })
    expect(t.integrationStatus).toBe('pending_integration')
    expect(t.qaSynthetic).toBe(false)
    expect(t.discoveryObservedLabel).toBeNull()
  })

  it('el texto de datos de prueba es el obligatorio de la modalidad QA', () => {
    expect(QA_BANNER).toBe('ENTORNO QA · DATOS DE PRUEBA')
  })
})

describe('perfil administrativo de empresa', () => {
  it('conserva ausencias como null y no inventa datos de contacto', () => {
    const profile = toStaffTenantProfile({
      id: TENANT,
      slug: 'capacity-01',
      legal_name: 'Capacity Tenant 01',
      tax_id: null,
      country: 'CO',
      city: null,
      segment: 'QA_SYNTHETIC_ONLY',
      account_manager: null,
      status: 'active',
      created_at: '2026-11-13T12:00:00Z',
      updated_at: '2026-11-13T13:00:00Z',
      external_tenant_id: null,
      verified_at: null,
      verified_by: null,
      integration_status: 'pending_integration',
      is_demo: false,
      discovery_source_system: null,
      discovery_observed_label: null,
      provisioned_authorized_by: null,
      provisioned_at: null,
      qa_synthetic: true,
    })
    expect(profile.taxId).toBeNull()
    expect(profile.city).toBeNull()
    expect(profile.externalTenantId).toBeNull()
    expect(profile.qaSynthetic).toBe(true)
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
        operation_id: null,
        status: 'recibida',
        created_by: RECORD,
        origin: 'portal_manual',
        created_at: '2026-11-13T12:00:00Z',
        updated_at: '2026-11-13T12:00:00Z',
      },
    })
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    const item = await api.createRequest(TENANT, {
      requestType: 'consulta',
      subject: 'Consulta de prueba',
      description: 'Descripción sintética suficientemente larga.',
      operationId: null,
    })
    expect(item.origin).toBe('portal_manual')
    expect(item.number).toBe('SOL-261113-0001')
    expect(f.calls[0]?.url).toBe(`${BASE}/staff/tenants/${TENANT}/requests`)
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({
      request_type: 'consulta',
      subject: 'Consulta de prueba',
      description: 'Descripción sintética suficientemente larga.',
      operation_id: null,
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
