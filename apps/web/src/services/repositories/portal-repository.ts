import type {
  Address,
  Attachment,
  Contact,
  DocumentRecord,
  EventComment,
  ID,
  Operation,
  OperationEvent,
  Quote,
  Request,
  RequestType,
  Tenant,
  User,
  Visibility,
} from '@/types/domain'

/**
 * Contrato de acceso a datos del portal.
 *
 * REGLAS:
 * - Toda operación recibe `tenantId` explícitamente y debe filtrar por él.
 *   Un recurso que pertenece a otra empresa se trata como inexistente (devuelve null / lista vacía).
 * - Los componentes nunca importan fixtures; solo usan este contrato.
 * - La implementación actual es mock (DEMO). La futura implementación HTTP debe
 *   cumplir este mismo contrato contra FastAPI.
 *
 * AVISO: este aislamiento es de presentación/demostración. La seguridad real
 * (identidad, pertenencia a tenant y permisos por endpoint) debe aplicarla FastAPI.
 */
export interface PortalRepository {
  getTenant(tenantId: ID): Promise<Tenant | null>
  listTenants(): Promise<Tenant[]>

  listUsers(tenantId: ID): Promise<User[]>
  getUser(tenantId: ID, userId: ID): Promise<User | null>
  /** Solo presentación local: inserta o actualiza un usuario (cuentas creadas en desarrollo). */
  replaceUser?(user: User): Promise<User>

  listAddresses(tenantId: ID): Promise<Address[]>
  listContacts(tenantId: ID): Promise<Contact[]>

  listOperations(tenantId: ID): Promise<Operation[]>
  getOperation(tenantId: ID, operationId: ID): Promise<Operation | null>
  listOperationEvents(tenantId: ID, operationId: ID): Promise<OperationEvent[]>

  /** Comentarios de un evento. Los internos se excluyen salvo que includeInternal sea true (solo operadores). */
  listEventComments(
    tenantId: ID,
    operationId: ID,
    eventId: ID,
    options?: { includeInternal?: boolean },
  ): Promise<EventComment[]>
  addEventComment(
    tenantId: ID,
    input: NewEventCommentInput,
  ): Promise<EventComment>

  listAttachments(tenantId: ID): Promise<Attachment[]>
  getAttachment(tenantId: ID, attachmentId: ID): Promise<Attachment | null>

  listDocuments(tenantId: ID): Promise<DocumentRecord[]>
  getDocument(tenantId: ID, documentId: ID): Promise<DocumentRecord | null>
  /** DEMO: registra una nueva versión solo en memoria local. No se almacena ningún archivo real. */
  addDocumentVersion(tenantId: ID, documentId: ID, input: { fileName: string; note: string; uploadedBy: string }): Promise<DocumentRecord>

  listQuotes(tenantId: ID): Promise<Quote[]>
  getQuote(tenantId: ID, quoteId: ID): Promise<Quote | null>
  /** DEMO: solo cambia el estado en memoria local. No ejecuta transacciones reales. */
  decideQuote(tenantId: ID, quoteId: ID, decision: 'Aceptada' | 'Rechazada'): Promise<Quote>

  listRequests(tenantId: ID): Promise<Request[]>
  createRequest(tenantId: ID, input: NewRequestInput): Promise<Request>
}

export interface NewEventCommentInput {
  operationId: ID
  eventId: ID
  parentCommentId: ID | null
  authorId: ID
  authorName: string
  authorSide: 'client' | 'operator'
  body: string
  visibility?: Visibility
}

export interface NewRequestInput {
  type: RequestType
  subject: string
  description: string
  operationId: ID | null
  attachmentIds: ID[]
  createdBy: ID
}
