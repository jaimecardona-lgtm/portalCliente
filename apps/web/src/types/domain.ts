/**
 * Modelos de dominio del Portal de Clientes.
 * Son el contrato que los repositorios exponen a los componentes.
 * Cuando exista FastAPI, sus respuestas deben mapear a estos mismos tipos.
 */

export type ID = string

export type Currency = 'USD' | 'COP' | 'EUR'

export type OperationStatus =
  | 'Creado'
  | 'En tránsito'
  | 'En puerto'
  | 'En aduana'
  | 'Pendiente cliente'
  | 'Entregado'
  | 'Cerrado'

export type TransportType = 'Marítimo FCL' | 'Marítimo LCL' | 'Aéreo' | 'Terrestre'

export type OperationKind = 'Importación' | 'Exportación' | 'Nacionalización'

export type EventType = 'status_change' | 'news' | 'document' | 'action_required'

export type Visibility = 'client' | 'internal'

export interface Tenant {
  id: ID
  legalName: string
  shortName: string
  taxId: string
  country: string
  city: string
  segment: string
  accountManager: string
  /** Color de acento para identificar la empresa en la interfaz (simulación). */
  accent: string
}

export interface User {
  id: ID
  tenantId: ID
  fullName: string
  email: string
  role: 'Administrador' | 'Operativo' | 'Comercial' | 'Consulta' | 'Cliente'
}

export interface Address {
  id: ID
  tenantId: ID
  label: string
  line: string
  city: string
  country: string
}

export interface Contact {
  id: ID
  tenantId: ID
  fullName: string
  role: string
  email: string
  phone: string
  kind: 'commercial' | 'operational'
}

export interface Attachment {
  id: ID
  tenantId: ID
  name: string
  sizeKb: number
  mimeType: string
  uploadedAt: string
  uploadedBy: ID
}

export interface Operation {
  id: ID
  tenantId: ID
  /** Número DO visible para el cliente (ej. DO-24-0187). */
  doNumber: string
  reference: string
  status: OperationStatus
  kind: OperationKind
  transport: TransportType
  owner: string
  ordenNumber: string
  booking: string
  origin: string
  destination: string
  etd: string | null
  eta: string | null
  atd: string | null
  ata: string | null
  freeDays: number | null
  documentClosingDate: string | null
  createdAt: string
  updatedAt: string
  /** Si es true requiere respuesta del cliente. */
  pendingClientResponse: boolean
}

export interface OperationEvent {
  id: ID
  tenantId: ID
  operationId: ID
  type: EventType
  occurredAt: string
  author: string
  authorId: ID | null
  title: string
  description: string
  fromStatus: OperationStatus | null
  toStatus: OperationStatus | null
  visibility: Visibility
  attachmentIds: ID[]
}

export interface EventComment {
  id: ID
  tenantId: ID
  operationId: ID
  /** Todo comentario pertenece a un evento concreto. */
  eventId: ID
  /** null para comentario raíz; id del comentario padre para respuestas. */
  parentCommentId: ID | null
  authorId: ID
  authorName: string
  authorSide: 'client' | 'operator'
  body: string
  createdAt: string
  visibility: Visibility
}

export type DocumentStatus = 'vigente' | 'por_vencer' | 'vencido'

export interface DocumentRecord {
  id: ID
  tenantId: ID
  name: string
  category: 'Legal' | 'Aduanero' | 'Financiero' | 'Operativo'
  issuedAt: string
  validFrom: string
  expiresAt: string
  status: DocumentStatus
  version: number
  attachmentId: ID | null
  history: DocumentVersion[]
}

export interface DocumentVersion {
  version: number
  uploadedAt: string
  uploadedBy: string
  note: string
}

export interface QuoteLine {
  id: ID
  concept: string
  quantity: number
  unit: string
  unitPrice: number
}

export type QuoteStatus = 'Pendiente' | 'Aceptada' | 'Rechazada' | 'Vencida'

export interface Quote {
  id: ID
  tenantId: ID
  number: string
  issuedAt: string
  validUntil: string
  version: number
  service: string
  origin: string
  destination: string
  currency: Currency
  status: QuoteStatus
  lines: QuoteLine[]
  conditions: string
  observations: string
}

export type RequestType = 'Consulta' | 'Modificación de datos' | 'Documentación' | 'Cotización' | 'Otro'

export type RequestStatus = 'Recibida' | 'En revisión' | 'Respondida' | 'Cerrada'

export interface Request {
  id: ID
  tenantId: ID
  number: string
  type: RequestType
  subject: string
  description: string
  operationId: ID | null
  status: RequestStatus
  createdAt: string
  updatedAt: string
  attachmentIds: ID[]
  createdBy: ID
}

export interface Session {
  userId: ID
  tenantId: ID
  /** Verdadero cuando el usuario cambió de empresa mediante el selector de simulación. */
  simulated: boolean
}
