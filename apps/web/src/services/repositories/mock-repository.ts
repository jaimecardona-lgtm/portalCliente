import {
  addresses,
  attachments,
  contacts,
  documents,
  eventComments,
  operationEvents,
  operations,
  quotes,
  requests,
  tenants,
  users,
} from '@/data/fixtures/demo-data'
import type { DocumentRecord, DocumentStatus, EventComment, ID, Quote, Request, User } from '@/types/domain'
import { referenceNow } from '@/lib/clock'
import type { NewEventCommentInput, NewRequestInput, PortalRepository } from './portal-repository'

export interface MockRepositoryOptions {
  /** Latencia simulada para mostrar estados de carga. 0 en pruebas. */
  latencyMs?: number
  /** Usuarios adicionales de presentación local (p. ej. el usuario de revisión configurado en localhost). */
  extraUsers?: User[]
  /** Fecha de referencia para derivar estados documentales. */
  now?: Date
}

const DEFAULT_LATENCY_MS = 180
const EXPIRING_SOON_DAYS = 45

/** Deriva el estado documental a partir de la fecha de vencimiento. */
export function deriveDocumentStatus(expiresAt: string, now: Date): DocumentStatus {
  const expires = new Date(`${expiresAt}T23:59:59-05:00`).getTime()
  if (expires < now.getTime()) return 'vencido'
  const soon = now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  return expires <= soon ? 'por_vencer' : 'vigente'
}

let idCounter = 0
function nextId(prefix: string): ID {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Crea un repositorio mock en memoria. Cada instancia tiene su propio estado,
 * así las pruebas no se contaminan entre sí.
 * Todas las lecturas filtran por tenantId; ningún método devuelve datos de otra empresa.
 */
export function createMockRepository(options: MockRepositoryOptions = {}): PortalRepository {
  const latency = options.latencyMs ?? DEFAULT_LATENCY_MS
  // Fecha de referencia fija del DEMO: los indicadores y estados son reproducibles.
  const now = options.now ?? referenceNow()

  // Copias de trabajo para que las escrituras DEMO no alteren los fixtures originales.
  let commentsState: EventComment[] = structuredClone(eventComments)
  let quotesState: Quote[] = structuredClone(quotes)
  let documentsState: DocumentRecord[] = structuredClone(documents)
  let usersState: User[] = [...users, ...(options.extraUsers ?? [])]
  let requestsState: Request[] = structuredClone(requests)

  const respond = async <T>(value: T): Promise<T> => {
    if (latency > 0) await wait(latency)
    return structuredClone(value)
  }

  return {
    async getTenant(tenantId) {
      return respond(tenants.find((t) => t.id === tenantId) ?? null)
    },
    async listTenants() {
      return respond(tenants)
    },

    async listUsers(tenantId) {
      return respond(usersState.filter((u) => u.tenantId === tenantId))
    },
    async replaceUser(user) {
      // Inserta o actualiza un usuario de presentación local (cuentas creadas en desarrollo).
      const exists = usersState.some((u) => u.id === user.id)
      usersState = exists ? usersState.map((u) => (u.id === user.id ? user : u)) : [...usersState, user]
      return respond(user)
    },
    async getUser(tenantId, userId) {
      return respond(usersState.find((u) => u.id === userId && u.tenantId === tenantId) ?? null)
    },

    async listAddresses(tenantId) {
      return respond(addresses.filter((a) => a.tenantId === tenantId))
    },
    async listContacts(tenantId) {
      return respond(contacts.filter((c) => c.tenantId === tenantId))
    },

    async listOperations(tenantId) {
      return respond(operations.filter((o) => o.tenantId === tenantId))
    },
    async getOperation(tenantId, operationId) {
      return respond(operations.find((o) => o.id === operationId && o.tenantId === tenantId) ?? null)
    },
    async listOperationEvents(tenantId, operationId) {
      const list = operationEvents
        .filter((e) => e.tenantId === tenantId && e.operationId === operationId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      return respond(list)
    },

    async listEventComments(tenantId, operationId, eventId, opts) {
      const includeInternal = opts?.includeInternal ?? false
      const list = commentsState.filter(
        (c) =>
          c.tenantId === tenantId &&
          c.operationId === operationId &&
          c.eventId === eventId &&
          (includeInternal || c.visibility === 'client'),
      )
      return respond(list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    },

    async addEventComment(tenantId, input: NewEventCommentInput) {
      // Validar que el evento y la operación pertenecen al mismo tenant.
      const eventOwned = operationEvents.some(
        (e) => e.id === input.eventId && e.operationId === input.operationId && e.tenantId === tenantId,
      )
      if (!eventOwned) {
        throw new Error('El evento no existe para esta operación.')
      }
      if (input.parentCommentId) {
        const parent = commentsState.find(
          (c) => c.id === input.parentCommentId && c.eventId === input.eventId && c.tenantId === tenantId,
        )
        if (!parent) throw new Error('El comentario padre no pertenece a este evento.')
      }
      const created: EventComment = {
        id: nextId('cm'),
        tenantId,
        operationId: input.operationId,
        eventId: input.eventId,
        parentCommentId: input.parentCommentId,
        authorId: input.authorId,
        authorName: input.authorName,
        authorSide: input.authorSide,
        body: input.body,
        createdAt: now.toISOString(),
        visibility: input.visibility ?? 'client',
      }
      commentsState = [...commentsState, created]
      return respond(created)
    },

    async listAttachments(tenantId) {
      return respond(attachments.filter((a) => a.tenantId === tenantId))
    },
    async getAttachment(tenantId, attachmentId) {
      return respond(attachments.find((a) => a.id === attachmentId && a.tenantId === tenantId) ?? null)
    },

    async listDocuments(tenantId) {
      const list: DocumentRecord[] = documentsState
        .filter((d) => d.tenantId === tenantId)
        .map((d) => ({ ...d, status: deriveDocumentStatus(d.expiresAt, now) }))
      return respond(list)
    },
    async getDocument(tenantId, documentId) {
      const doc = documentsState.find((d) => d.id === documentId && d.tenantId === tenantId)
      if (!doc) return respond(null)
      return respond({ ...doc, status: deriveDocumentStatus(doc.expiresAt, now) })
    },

    async addDocumentVersion(tenantId, documentId, input) {
      const current = documentsState.find((d) => d.id === documentId && d.tenantId === tenantId)
      if (!current) throw new Error('Documento no encontrado.')
      const stamp = now.toISOString().slice(0, 10)
      const updated: DocumentRecord = {
        ...current,
        version: current.version + 1,
        issuedAt: stamp,
        validFrom: stamp,
        // Vigencia de un año por defecto en DEMO; el valor real lo define el documento cargado.
        expiresAt: `${Number(stamp.slice(0, 4)) + 1}${stamp.slice(4)}`,
        history: [
          { version: current.version + 1, uploadedAt: stamp, uploadedBy: input.uploadedBy, note: input.note || input.fileName },
          ...current.history,
        ],
      }
      documentsState = documentsState.map((d) => (d.id === documentId ? updated : d))
      return respond({ ...updated, status: deriveDocumentStatus(updated.expiresAt, now) })
    },

    async listQuotes(tenantId) {
      return respond(quotesState.filter((q) => q.tenantId === tenantId))
    },
    async getQuote(tenantId, quoteId) {
      return respond(quotesState.find((q) => q.id === quoteId && q.tenantId === tenantId) ?? null)
    },
    async decideQuote(tenantId, quoteId, decision) {
      const current = quotesState.find((q) => q.id === quoteId && q.tenantId === tenantId)
      if (!current) throw new Error('Cotización no encontrada.')
      const validUntil = new Date(`${current.validUntil}T23:59:59-05:00`)
      if (current.status !== 'Pendiente' || validUntil < now) {
        throw new Error('La cotización no admite decisiones en su estado o vigencia actual.')
      }
      const updated: Quote = { ...current, status: decision }
      quotesState = quotesState.map((q) => (q.id === quoteId ? updated : q))
      return respond(updated)
    },

    async listRequests(tenantId) {
      return respond(
        requestsState
          .filter((r) => r.tenantId === tenantId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async createRequest(tenantId, input: NewRequestInput) {
      const stamp = now.toISOString()
      const created: Request = {
        id: nextId('rq'),
        tenantId,
        number: `SOL-${String(900 + requestsState.length).padStart(4, '0')}`,
        type: input.type,
        subject: input.subject,
        description: input.description,
        operationId: input.operationId,
        status: 'Recibida',
        createdAt: stamp,
        updatedAt: stamp,
        attachmentIds: input.attachmentIds,
        createdBy: input.createdBy,
      }
      requestsState = [created, ...requestsState]
      return respond(created)
    },
  }
}
