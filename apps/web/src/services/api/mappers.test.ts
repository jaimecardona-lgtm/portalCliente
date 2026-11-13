import { describe, it, expect } from 'vitest'
import { OPERATION_STATUSES } from '@/features/operations/status'
import { buildThread } from '@/features/operations/thread-utils'
import {
  KNOWN_OPERATION_STATUSES,
  mapList,
  toCommentCreateBody,
  toCurrentAccount,
  toEventComment,
  toOperationEvent,
  toOperationSummary,
} from './mappers'
import { PortalApiError } from './http-client'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OP = '33333333-3333-4333-8333-333333333333'
const EVENT = '44444444-4444-4444-8444-444444444444'

const ME = {
  user_id: '88888888-8888-4888-8888-888888888888',
  full_name: 'Ana Prueba',
  tenant: { id: TENANT, slug: 'tn-andino', legal_name: 'Textiles Andinos S.A.S.' },
  role: 'client_admin',
  can_comment: true,
  memberships: [{ tenant_id: TENANT, role: 'client_admin' }],
}

function expectInvalid(fn: () => unknown, field?: string): void {
  let caught: unknown = null
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PortalApiError)
  expect((caught as PortalApiError).code).toBe('invalid_response')
  if (field) expect((caught as PortalApiError).message).toContain(field)
}

describe('estados de operación', () => {
  it('los cinco estados reales están en el dominio y en la lista de filtros de la interfaz', () => {
    const real = ['Abierto', 'En tránsito', 'Finalizado', 'En proceso de facturación', 'Cerrado / Liquidado']
    expect([...OPERATION_STATUSES]).toEqual(real)
    for (const s of real) expect(KNOWN_OPERATION_STATUSES).toContain(s)
  })
})

describe('toCurrentAccount', () => {
  it('convierte snake_case en camelCase y conserva membresías', () => {
    const account = toCurrentAccount(ME)
    expect(account).toEqual({
      userId: ME.user_id,
      fullName: 'Ana Prueba',
      tenant: { id: TENANT, slug: 'tn-andino', legalName: 'Textiles Andinos S.A.S.' },
      role: 'client_admin',
      canComment: true,
      memberships: [{ tenantId: TENANT, role: 'client_admin' }],
    })
  })

  it('rechaza una respuesta sin empresa', () => {
    const { tenant: _omit, ...withoutTenant } = ME
    expectInvalid(() => toCurrentAccount(withoutTenant), 'tenant')
  })

  it('rechaza un tipo incorrecto en can_comment', () => {
    expectInvalid(() => toCurrentAccount({ ...ME, can_comment: 'sí' }), 'can_comment')
  })
})

describe('toOperationSummary', () => {
  it('usa el tenant del contexto autenticado, no un campo del cuerpo', () => {
    const summary = toOperationSummary(
      { id: OP, do_number: 'DO-A-1001', reference: 'Pedido sintético', last_known_status: 'En tránsito', last_synced_at: null },
      TENANT,
    )
    expect(summary).toEqual({
      id: OP,
      tenantId: TENANT,
      doNumber: 'DO-A-1001',
      reference: 'Pedido sintético',
      lastKnownStatus: 'En tránsito',
      lastSyncedAt: null,
    })
  })

  it('un estado que el dominio no conoce se muestra como «Estado no reconocido», sin lanzar', () => {
    expect(toOperationSummary({ id: OP, do_number: 'DO-1', last_known_status: 'Inventado' }, TENANT).lastKnownStatus).toBe(
      'Estado no reconocido',
    )
  })
})

describe('toOperationEvent', () => {
  const event = {
    id: EVENT,
    event_type: 'status_change',
    occurred_at: '2026-11-10T14:00:00Z',
    title: 'Salida de origen',
    description: null,
    author_name: null,
    from_status: 'Creado',
    to_status: 'En tránsito',
  }

  it('mapea eventos visibles para el cliente y deja vacíos los adjuntos', () => {
    const mapped = toOperationEvent(event, TENANT, OP)
    expect(mapped).toMatchObject({
      id: EVENT,
      tenantId: TENANT,
      operationId: OP,
      type: 'status_change',
      author: '',
      authorId: null,
      description: '',
      fromStatus: 'Creado',
      toStatus: 'En tránsito',
      visibility: 'client',
      attachmentIds: [],
    })
  })

  it('rechaza un tipo de evento desconocido', () => {
    expectInvalid(() => toOperationEvent({ ...event, event_type: 'interno' }, TENANT, OP), 'event_type')
  })
})

describe('toEventComment y el hilo de respuestas', () => {
  const raw = (id: string, parent: string | null, createdAt: string) => ({
    id,
    event_id: EVENT,
    parent_comment_id: parent,
    author_name: parent ? 'Equipo Logixtic' : 'Ana Prueba',
    author_side: parent ? 'operator' : 'client',
    body: `Mensaje ${id}`,
    created_at: createdAt,
  })

  it('nunca copia author_id aunque llegue en la respuesta', () => {
    const mapped = toEventComment({ ...raw('c1', null, '2026-11-10T10:00:00Z'), author_id: 'ajeno' }, TENANT, OP)
    expect(mapped.authorId).toBe('')
    expect(JSON.stringify(mapped)).not.toContain('ajeno')
    expect(mapped.visibility).toBe('client')
  })

  it('conserva parent_comment_id para que buildThread anide las respuestas', () => {
    const comments = [
      toEventComment(raw('c1', null, '2026-11-10T10:00:00Z'), TENANT, OP),
      toEventComment(raw('c2', 'c1', '2026-11-10T11:00:00Z'), TENANT, OP),
      toEventComment(raw('c3', 'c2', '2026-11-10T12:00:00Z'), TENANT, OP),
    ]
    const tree = buildThread(comments, EVENT)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children[0]?.children[0]?.comment.id).toBe('c3')
    expect(tree[0]?.children[0]?.children[0]?.depth).toBe(2)
  })

  it('rechaza un lado de autor fuera del contrato', () => {
    expectInvalid(() => toEventComment({ ...raw('c1', null, 'x'), author_side: 'admin' }, TENANT, OP), 'author_side')
  })
})

describe('toCommentCreateBody y mapList', () => {
  it('solo envía el texto y el padre: autor, lado y empresa los decide el servidor', () => {
    expect(toCommentCreateBody({ body: 'Hola', parentCommentId: null })).toEqual({
      body: 'Hola',
      parent_comment_id: null,
    })
  })

  it('mapList exige un arreglo', () => {
    expect(mapList([1, 2], (n) => Number(n) * 2)).toEqual([2, 4])
    expectInvalid(() => mapList({ no: 'lista' }, (x) => x), 'list')
  })
})
