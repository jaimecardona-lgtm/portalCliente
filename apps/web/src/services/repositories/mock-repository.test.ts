import { describe, it, expect } from 'vitest'
import { createMockRepository, deriveDocumentStatus } from './mock-repository'
import { DEMO_NOW, operations, quotes, eventComments, operationEvents } from '@/data/fixtures/demo-data'

const ANDINO = 'tn-andino'
const PACIFICO = 'tn-pacifico'
const NOW = new Date(DEMO_NOW)

function repo() {
  return createMockRepository({ latencyMs: 0, now: NOW })
}

describe('aislamiento por tenant (datos DEMO)', () => {
  it('listOperations devuelve solo operaciones del tenant solicitado', async () => {
    const r = repo()
    const andino = await r.listOperations(ANDINO)
    const pacifico = await r.listOperations(PACIFICO)
    expect(andino.length).toBeGreaterThan(0)
    expect(pacifico.length).toBeGreaterThan(0)
    expect(andino.every((o) => o.tenantId === ANDINO)).toBe(true)
    expect(pacifico.every((o) => o.tenantId === PACIFICO)).toBe(true)
  })

  it('un usuario de Tenant A no puede abrir una operación de Tenant B por ID directo', async () => {
    const r = repo()
    const otherTenantOp = operations.find((o) => o.tenantId === PACIFICO)!
    expect(await r.getOperation(ANDINO, otherTenantOp.id)).toBeNull()
    expect(await r.listOperationEvents(ANDINO, otherTenantOp.id)).toEqual([])
  })

  it('cotizaciones y solicitudes de otro tenant no son accesibles por ID', async () => {
    const r = repo()
    const pacificoQuote = quotes.find((q) => q.tenantId === PACIFICO)!
    expect(await r.getQuote(ANDINO, pacificoQuote.id)).toBeNull()
    await expect(r.decideQuote(ANDINO, pacificoQuote.id, 'Aceptada')).rejects.toThrow()
    const pacificoRequests = await r.listRequests(ANDINO)
    expect(pacificoRequests.every((x) => x.tenantId === ANDINO)).toBe(true)
  })

  it('documentos y adjuntos de otro tenant no son accesibles', async () => {
    const r = repo()
    const docs = await r.listDocuments(ANDINO)
    expect(docs.every((d) => d.tenantId === ANDINO)).toBe(true)
    const attachments = await r.listAttachments(ANDINO)
    expect(attachments.every((a) => a.tenantId === ANDINO)).toBe(true)
    expect(await r.getAttachment(ANDINO, 'at-6')).toBeNull() // at-6 pertenece a Pacífico
  })

  it('no se puede comentar sobre un evento de otro tenant aunque se conozca el ID', async () => {
    const r = repo()
    const foreignEvent = operationEvents.find((e) => e.tenantId === PACIFICO)!
    await expect(
      r.addEventComment(ANDINO, {
        operationId: foreignEvent.operationId,
        eventId: foreignEvent.id,
        parentCommentId: null,
        authorId: 'us-ana',
        authorName: 'Ana',
        authorSide: 'client',
        body: 'Intento de acceso cruzado',
      }),
    ).rejects.toThrow(/no existe/i)
  })
})

describe('comentarios por evento', () => {
  it('los comentarios internos no se devuelven a clientes por defecto', async () => {
    const r = repo()
    const internal = eventComments.find((c) => c.visibility === 'internal')!
    const visible = await r.listEventComments(internal.tenantId, internal.operationId, internal.eventId)
    expect(visible.find((c) => c.id === internal.id)).toBeUndefined()
    const all = await r.listEventComments(internal.tenantId, internal.operationId, internal.eventId, { includeInternal: true })
    expect(all.find((c) => c.id === internal.id)).toBeDefined()
  })

  it('una respuesta conserva parentCommentId y queda vinculada al mismo evento', async () => {
    const r = repo()
    const parent = eventComments.find((c) => c.tenantId === ANDINO && c.parentCommentId === null && c.visibility === 'client')!
    const created = await r.addEventComment(ANDINO, {
      operationId: parent.operationId,
      eventId: parent.eventId,
      parentCommentId: parent.id,
      authorId: 'us-ana',
      authorName: 'Ana Lucía Torres',
      authorSide: 'client',
      body: 'Respuesta de prueba',
    })
    expect(created.parentCommentId).toBe(parent.id)
    expect(created.eventId).toBe(parent.eventId)
    expect(created.tenantId).toBe(ANDINO)
  })

  it('no permite responder a un comentario de otro evento', async () => {
    const r = repo()
    // cm-1 pertenece al evento ev-0398-3; cm-5 pertenece al evento ev-0433-3.
    const a = eventComments.find((c) => c.id === 'cm-1')!
    const b = eventComments.find((c) => c.id === 'cm-5')!
    expect(a.eventId).not.toBe(b.eventId)
    await expect(
      r.addEventComment(ANDINO, {
        operationId: b.operationId,
        eventId: b.eventId,
        parentCommentId: a.id,
        authorId: 'us-ana',
        authorName: 'Ana',
        authorSide: 'client',
        body: 'Respuesta cruzada',
      }),
    ).rejects.toThrow(/padre/i)
  })

  it('un cambio de estado no modifica la operación', async () => {
    const r = repo()
    const before = await r.getOperation(ANDINO, 'op-0398')
    await r.addEventComment(ANDINO, {
      operationId: 'op-0398',
      eventId: 'ev-0398-3',
      parentCommentId: null,
      authorId: 'us-luis',
      authorName: 'Luis',
      authorSide: 'client',
      body: 'Confirmo el valor FOB.',
    })
    const after = await r.getOperation(ANDINO, 'op-0398')
    expect(after?.status).toBe(before?.status)
  })
})

describe('reglas de dominio', () => {
  it('deriveDocumentStatus clasifica vencido, por vencer y vigente', () => {
    expect(deriveDocumentStatus('2026-01-01', NOW)).toBe('vencido')
    expect(deriveDocumentStatus('2026-12-20', NOW)).toBe('por_vencer')
    expect(deriveDocumentStatus('2027-06-01', NOW)).toBe('vigente')
  })

  it('una cotización vencida no admite decisiones', async () => {
    const r = repo()
    const expired = quotes.find((q) => q.tenantId === ANDINO && q.validUntil < '2026-11-11')!
    await expect(r.decideQuote(ANDINO, expired.id, 'Aceptada')).rejects.toThrow(/vigencia|estado/i)
  })

  it('una cotización pendiente vigente sí se puede decidir (solo en memoria)', async () => {
    const r = repo()
    const pending = quotes.find((q) => q.tenantId === ANDINO && q.status === 'Pendiente')!
    const updated = await r.decideQuote(ANDINO, pending.id, 'Rechazada')
    expect(updated.status).toBe('Rechazada')
    // El fixture original no se altera.
    expect(quotes.find((q) => q.id === pending.id)?.status).toBe('Pendiente')
  })

  it('createRequest registra la solicitud con estado Recibida', async () => {
    const r = repo()
    const created = await r.createRequest(ANDINO, {
      type: 'Consulta',
      subject: 'Consulta de prueba',
      description: 'Descripción suficientemente larga para la prueba.',
      operationId: null,
      attachmentIds: [],
      createdBy: 'us-ana',
    })
    expect(created.status).toBe('Recibida')
    expect(created.tenantId).toBe(ANDINO)
    const list = await r.listRequests(ANDINO)
    expect(list.some((x) => x.id === created.id)).toBe(true)
  })
})
