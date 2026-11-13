import { describe, it, expect, vi } from 'vitest'
import { PortalApiError } from './http-client'
import { createStaffApi, staffErrorMessage, toStaffMe, toStaffTenant } from './staff-api'

const BASE = 'https://api.prueba.test/api/v1'
const TENANT = '3f9c1a2e-0000-4000-8000-0000000000e1'

function fake(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return handler(String(input), init ?? {})
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createStaffApi', () => {
  it('sin token no hay petición', async () => {
    const f = fake(() => json(200, {}))
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => null, fetchImpl: f.fetchImpl })
    await expect(api.me()).rejects.toMatchObject({ code: 'authentication_required' })
    expect(f.calls).toHaveLength(0)
  })

  it('lee el rol y los permisos desde el servidor', async () => {
    const f = fake(() =>
      json(200, { user_id: 'u1', full_name: 'QA Prueba', staff_role: 'qa', permissions: ['tenants.read'] }),
    )
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    await expect(api.me()).resolves.toEqual({
      userId: 'u1',
      fullName: 'QA Prueba',
      staffRole: 'qa',
      permissions: ['tenants.read'],
    })
    expect(f.calls[0]?.url).toBe(`${BASE}/staff/me`)
  })

  it('selecciona contexto enviando el identificador del tenant y el motivo', async () => {
    const f = fake(() =>
      json(200, { tenant: { id: TENANT, slug: 'tn-andino', legal_name: 'Empresa', external_tenant_id: 'EXT-1' } }),
    )
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    const tenant = await api.selectContext(TENANT, 'Soporte de prueba')
    expect(tenant.externalTenantId).toBe('EXT-1')
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({ tenant_id: TENANT, reason: 'Soporte de prueba' })
  })

  it('un identificador no UUID no genera petición', async () => {
    const f = fake(() => json(200, {}))
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    await expect(api.operations('../../etc')).rejects.toMatchObject({ code: 'not_found' })
    await expect(api.selectContext('x', 'Soporte de prueba')).rejects.toMatchObject({ code: 'not_found' })
    expect(f.calls).toHaveLength(0)
  })

  it('traduce el error de un tenant no asignado sin revelar si existe', async () => {
    const f = fake(() =>
      json(403, { error: { code: 'tenant_not_authorized', message: 'x', request_id: 'r1' } }),
    )
    const api = createStaffApi({ baseUrl: BASE, getToken: async () => 't', fetchImpl: f.fetchImpl })
    await expect(api.selectContext(TENANT, 'Soporte de prueba')).rejects.toMatchObject({ code: 'tenant_not_authorized', status: 403 })
    const message = staffErrorMessage(new PortalApiError('tenant_not_authorized', 'x', 403))
    expect(message).toMatch(/no tiene acceso/i)
    expect(message).not.toMatch(/existe/i)
  })

  it('un cliente sin rol interno recibe el mensaje de acceso no autorizado', () => {
    expect(staffErrorMessage(new PortalApiError('no_staff_role', 'x', 403))).toMatch(/rol interno/)
  })
})

describe('mapeo de respuestas de personal', () => {
  it('rechaza un tenant sin identificador', () => {
    expect(() => toStaffTenant({ id: TENANT, slug: 'x' })).toThrow(PortalApiError)
  })

  it('lee permisos solo como cadenas', () => {
    expect(toStaffMe({ user_id: 'u', full_name: 'n', staff_role: 'qa', permissions: ['a', 3, null] }).permissions).toEqual(['a'])
  })
})
