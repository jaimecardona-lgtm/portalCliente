import { describe, it, expect } from 'vitest'
import { buildThread } from '@/features/operations/thread-utils'
import { createHttpPortalRepository } from './http-portal-repository'
import { PortalApiError } from './http-client'

// Datos sintéticos: empresas, personas y operaciones inventadas.
const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const OP = '33333333-3333-4333-8333-333333333333'
const OP_OTHER = '77777777-7777-4777-8777-777777777777'
const EVENT = '44444444-4444-4444-8444-444444444444'
const ROOT = '55555555-5555-4555-8555-555555555555'
const REPLY = '66666666-6666-4666-8666-666666666666'
const UNKNOWN = '99999999-9999-4999-8999-999999999999'
const BASE = 'https://api.portal.test'

const ME = {
  user_id: '88888888-8888-4888-8888-888888888888',
  full_name: 'Ana Prueba',
  tenant: { id: TENANT, slug: 'tn-andino', legal_name: 'Textiles Andinos S.A.S.' },
  role: 'client_admin',
  can_comment: true,
  memberships: [{ tenant_id: TENANT, role: 'client_admin' }],
}

const NOT_FOUND = { error: { code: 'not_found', message: 'No existe.', request_id: 'req-000000' } }

interface Call {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

interface Reply {
  status: number
  body?: unknown
}

/** Respuestas sintéticas: registra cada petición para comprobar qué salió realmente a la red. */
function fakeApi(handler: (call: Call) => Reply | undefined) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      path: String(input).replace(`${BASE}/api/v1`, ''),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const reply = handler(call) ?? (call.path === '/me' ? { status: 200, body: ME } : { status: 404, body: NOT_FOUND })
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body)
    return { ok: reply.status < 400, status: reply.status, text: async () => text } as unknown as Response
  }) as typeof fetch
  return { fetchImpl, calls, paths: () => calls.map((c) => c.path) }
}

function repo(api: ReturnType<typeof fakeApi>, selectedTenantId?: string) {
  return createHttpPortalRepository({
    baseUrl: BASE,
    getToken: async () => 'token-sintetico',
    fetchImpl: api.fetchImpl,
    selectedTenantId,
  })
}

const OP_ROW = {
  id: OP,
  do_number: 'DO-A-1001',
  reference: 'Pedido sintético',
  last_known_status: 'En tránsito',
  last_synced_at: '2026-11-10T09:00:00Z',
}

describe('cuenta y empresa activa', () => {
  it('lee /me una sola vez aunque se llame varias veces', async () => {
    const api = fakeApi(() => undefined)
    const r = repo(api)
    const [a, b] = await Promise.all([r.getCurrentAccount(), r.getCurrentAccount()])
    await r.getCurrentAccount()
    expect(a).toEqual(b)
    expect(a.tenant.id).toBe(TENANT)
    expect(api.paths().filter((p) => p === '/me')).toHaveLength(1)
  })

  it('no conserva errores: tras un 401 vuelve a consultar al servidor', async () => {
    let attempt = 0
    const api = fakeApi((call) => {
      if (call.path !== '/me') return undefined
      attempt += 1
      return attempt === 1
        ? { status: 401, body: { error: { code: 'invalid_token', message: 'Caducado.', request_id: 'req-111111' } } }
        : undefined
    })
    const r = repo(api)
    await expect(r.getCurrentAccount()).rejects.toMatchObject({ code: 'invalid_token', status: 401 })
    await expect(r.getCurrentAccount()).resolves.toMatchObject({ userId: ME.user_id })
  })

  it('envía X-Tenant-Id solo con la empresa elegida por el usuario', async () => {
    const api = fakeApi(() => undefined)
    await repo(api, TENANT).getCurrentAccount()
    expect(api.calls[0]?.headers['X-Tenant-Id']).toBe(TENANT)
  })
})

describe('aislamiento por empresa', () => {
  it('una empresa distinta de la activa devuelve listas vacías sin consultar la red', async () => {
    const api = fakeApi(() => undefined)
    const r = repo(api)
    await expect(r.listOperationSummaries(OTHER_TENANT)).resolves.toEqual([])
    await expect(r.listOperationEvents(OTHER_TENANT, OP)).resolves.toEqual([])
    await expect(r.listEventComments(OTHER_TENANT, OP, EVENT)).resolves.toEqual([])
    expect(api.paths().filter((p) => p.startsWith('/operations'))).toEqual([])
  })

  it('una operación de otra empresa responde null igual que una inexistente', async () => {
    const api = fakeApi((call) =>
      call.path === `/operations/${OP_OTHER}`
        ? { status: 404, body: { error: { code: 'operation_not_found', message: 'La operación no existe.', request_id: 'req-222222' } } }
        : undefined,
    )
    const r = repo(api)
    await expect(r.getOperationSummary(TENANT, OP_OTHER)).resolves.toBeNull()
    await expect(r.getOperationSummary(TENANT, UNKNOWN)).resolves.toBeNull()
  })

  it('un identificador que no es UUID no sale a la red', async () => {
    const api = fakeApi(() => undefined)
    await expect(repo(api).getOperationSummary(TENANT, '../me')).resolves.toBeNull()
    expect(api.paths().some((p) => p.includes('..'))).toBe(false)
  })
})

describe('operaciones y eventos', () => {
  it('lista operaciones de la empresa activa con paginación', async () => {
    const api = fakeApi((call) => (call.path.startsWith('/operations?') ? { status: 200, body: [OP_ROW] } : undefined))
    const rows = await repo(api).listOperationSummaries(TENANT, { limit: 10, offset: 20 })
    expect(rows).toEqual([
      expect.objectContaining({ id: OP, tenantId: TENANT, doNumber: 'DO-A-1001', lastKnownStatus: 'En tránsito' }),
    ])
    expect(api.paths()).toContain('/operations?limit=10&offset=20')
  })

  it('el detalle de una operación no inventa los campos que la API no expone', async () => {
    const api = fakeApi((call) => (call.path === `/operations/${OP}` ? { status: 200, body: OP_ROW } : undefined))
    const op = await repo(api).getOperationSummary(TENANT, OP)
    expect(op).toMatchObject({ doNumber: 'DO-A-1001', reference: 'Pedido sintético' })
    expect(op).not.toHaveProperty('kind')
    expect(op).not.toHaveProperty('transport')
  })

  it('lista eventos de la operación con su identificador', async () => {
    const api = fakeApi((call) =>
      call.path === `/operations/${OP}/events`
        ? {
            status: 200,
            body: [
              {
                id: EVENT,
                event_type: 'status_change',
                occurred_at: '2026-11-10T14:00:00Z',
                title: 'Salida de origen',
                description: null,
                author_name: null,
                from_status: null,
                to_status: 'En tránsito',
              },
            ],
          }
        : undefined,
    )
    const events = await repo(api).listOperationEvents(TENANT, OP)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: EVENT, operationId: OP, tenantId: TENANT, toStatus: 'En tránsito' })
  })
})

describe('comentarios y respuestas anidadas', () => {
  const COMMENTS = [
    {
      id: ROOT,
      event_id: EVENT,
      parent_comment_id: null,
      author_name: 'Ana Prueba',
      author_side: 'client',
      body: '¿Cuándo llega?',
      created_at: '2026-11-10T10:00:00Z',
    },
    {
      id: REPLY,
      event_id: EVENT,
      parent_comment_id: ROOT,
      author_name: 'Equipo Logixtic',
      author_side: 'operator',
      body: 'Llega el jueves.',
      created_at: '2026-11-10T11:00:00Z',
    },
  ]

  it('devuelve los comentarios del evento y el hilo se construye con parentCommentId', async () => {
    const api = fakeApi((call) => (call.path === `/operations/${OP}/events/${EVENT}/comments` ? { status: 200, body: COMMENTS } : undefined))
    const comments = await repo(api).listEventComments(TENANT, OP, EVENT)
    const tree = buildThread(comments, EVENT)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.comment.id).toBe(ROOT)
    expect(tree[0]?.children[0]?.comment.body).toBe('Llega el jueves.')
    expect(tree[0]?.children[0]?.depth).toBe(1)
  })

  it('pedir comentarios internos se rechaza: la API nunca los devuelve al portal', async () => {
    const api = fakeApi(() => undefined)
    await expect(repo(api).listEventComments(TENANT, OP, EVENT, { includeInternal: true })).rejects.toMatchObject({
      code: 'not_available_in_api',
    })
    expect(api.paths().some((p) => p.includes('/comments'))).toBe(false)
  })

  it('enviar un comentario transmite solo el texto y el padre; autor y lado del llamador se ignoran', async () => {
    const api = fakeApi((call) =>
      call.method === 'POST'
        ? { status: 201, body: { ...COMMENTS[1], id: UNKNOWN, parent_comment_id: ROOT, author_side: 'client', author_name: 'Ana Prueba' } }
        : undefined,
    )
    const created = await repo(api).addEventComment(TENANT, {
      operationId: OP,
      eventId: EVENT,
      parentCommentId: ROOT,
      authorId: 'suplantado',
      authorName: 'Otra Persona',
      authorSide: 'operator',
      body: '  Gracias  ',
    })
    const post = api.calls.find((c) => c.method === 'POST')
    expect(post?.body).toEqual({ body: '  Gracias  ', parent_comment_id: ROOT })
    expect(created.authorSide).toBe('client')
    expect(created.parentCommentId).toBe(ROOT)
  })

  it('no envía comentarios a una empresa que no es la activa', async () => {
    const api = fakeApi(() => undefined)
    await expect(
      repo(api).addEventComment(OTHER_TENANT, {
        operationId: OP,
        eventId: EVENT,
        parentCommentId: null,
        authorId: ME.user_id,
        authorName: 'Ana Prueba',
        authorSide: 'client',
        body: 'Hola',
      }),
    ).rejects.toBeInstanceOf(PortalApiError)
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('el servidor rechaza al rol que solo puede consultar, y el error llega con su código', async () => {
    const api = fakeApi((call) =>
      call.method === 'POST'
        ? { status: 403, body: { error: { code: 'role_cannot_comment', message: 'Solo consulta.', request_id: 'req-333333' } } }
        : undefined,
    )
    await expect(
      repo(api).addEventComment(TENANT, {
        operationId: OP,
        eventId: EVENT,
        parentCommentId: null,
        authorId: ME.user_id,
        authorName: 'Ana Prueba',
        authorSide: 'client',
        body: 'Hola',
      }),
    ).rejects.toMatchObject({ code: 'role_cannot_comment', status: 403, requestId: 'req-333333' })
  })
})

describe('métodos fuera de la API v1', () => {
  it('rechazan con not_available_in_api sin hacer peticiones', async () => {
    const api = fakeApi(() => undefined)
    const r = repo(api)
    await expect(r.listUsers(TENANT)).rejects.toMatchObject({ code: 'not_available_in_api' })
    await expect(r.listQuotes(TENANT)).rejects.toMatchObject({ code: 'not_available_in_api' })
    expect(api.calls).toHaveLength(0)
  })
})
