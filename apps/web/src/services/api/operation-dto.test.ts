import { describe, it, expect } from 'vitest'
import { toOperationFromDto } from './mappers'

const TENANT = '3f9c1a2e-0000-4000-8000-0000000000aa'
const ID = '3f9c1a2e-0000-4000-8000-0000000000bb'

describe('toOperationFromDto', () => {
  it('mapea los datos persistidos y deja null lo que no existe', () => {
    const op = toOperationFromDto({
      id: ID, do_number: 'DO-DEMO-A-001', reference: 'Pedido sintético', last_known_status: 'En tránsito',
      last_synced_at: '2026-11-13T00:00:00Z', origin_name: 'Origen demo', destination_name: null,
      transport_type: 'Marítimo FCL', etd: '2026-10-20', eta: '2026-11-25', booking_number: null,
      carrier_name: 'Transportador demo', responsible_name: null, pending_client_response: true,
    }, TENANT)
    expect(op).not.toBeNull()
    expect(op).toMatchObject({ doNumber: 'DO-DEMO-A-001', status: 'En tránsito', origin: 'Origen demo', destination: null,
      transport: 'Marítimo FCL', eta: '2026-11-25', booking: null, owner: null, pendingClientResponse: true, kind: null })
  })

  it('un estado desconocido se muestra como «Estado no reconocido» con su valor original: no inventa estado ni descarta la fila', () => {
    const op = toOperationFromDto({ id: ID, do_number: 'DO-X-1', last_known_status: 'Estado inventado' }, TENANT)
    expect(op).not.toBeNull()
    expect(op?.status).toBe('Estado no reconocido')
    expect(op?.statusRaw).toBe('Estado inventado')
  })

  it('una operación sin estado se conserva como «Estado no reconocido», sin estado inventado', () => {
    const op = toOperationFromDto({ id: ID, do_number: 'DO-X-1', last_known_status: null }, TENANT)
    expect(op?.status).toBe('Estado no reconocido')
    expect(op?.statusRaw).toBeNull()
  })

  it('pending_client_response ausente queda como null, no como false', () => {
    const op = toOperationFromDto({ id: ID, do_number: 'DO-X-2', last_known_status: 'Creado' }, TENANT)
    expect(op?.pendingClientResponse).toBeNull()
  })
})
