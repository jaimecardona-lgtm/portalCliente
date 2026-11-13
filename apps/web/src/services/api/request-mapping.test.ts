import { describe, expect, it } from 'vitest'
import { requestFromStaff, requestsFromStaff, REQUEST_TYPE_TO_DB } from './request-mapping'
import type { StaffRequest } from './staff-api'

const base: StaffRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  number: 'SOL-1',
  requestType: 'cotizacion',
  subject: 'Asunto de prueba',
  description: 'Descripción de prueba',
  operationId: '33333333-3333-4333-8333-333333333333',
  status: 'en_revision',
  createdBy: '44444444-4444-4444-8444-444444444444',
  origin: 'staff',
  createdAt: '2026-11-10T10:00:00Z',
  updatedAt: '2026-11-10T11:00:00Z',
}

describe('requestFromStaff', () => {
  it('traduce tipo y estado de base de datos a los valores del dominio', () => {
    const r = requestFromStaff(base)
    expect(r.type).toBe('Cotización')
    expect(r.status).toBe('En revisión')
    expect(r.createdBy).toBe(base.createdBy)
    expect(r.attachmentIds).toEqual([])
    expect(r.operationId).toBe(base.operationId)
    expect(r.updatedAt).toBe(base.updatedAt)
  })

  it('un tipo o estado fuera del CHECK de la base es un error explícito, no un valor inventado', () => {
    expect(() => requestFromStaff({ ...base, requestType: 'desconocido' })).toThrow(/request_type/)
    expect(() => requestFromStaff({ ...base, status: 'archivada' })).toThrow(/status/)
  })

  it('cubre todos los tipos del CHECK y el mapa inverso', () => {
    for (const dbType of ['consulta', 'modificacion_datos', 'documentacion', 'cotizacion', 'otro']) {
      const type = requestFromStaff({ ...base, requestType: dbType }).type
      expect(REQUEST_TYPE_TO_DB[type]).toBe(dbType)
    }
  })
})

describe('requestsFromStaff', () => {
  it('lista vacía sin error cuando no hay solicitudes', () => {
    expect(requestsFromStaff([])).toEqual([])
  })

  it('ordena de la más reciente a la más antigua', () => {
    const list = requestsFromStaff([
      { ...base, id: 'a', createdAt: '2026-11-01T00:00:00Z' },
      { ...base, id: 'b', createdAt: '2026-11-09T00:00:00Z' },
    ])
    expect(list.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
