/**
 * Transformación de respuestas de la API (`snake_case`) a modelos del portal (`camelCase`).
 *
 * Reglas:
 * - Cada respuesta se valida en tiempo de ejecución. Una forma inesperada lanza
 *   `PortalApiError('invalid_response')`: nunca se muestran datos a medio validar.
 * - Un valor de estado o tipo desconocido también es error: no se sustituye por otro "parecido".
 * - Los campos que la API no expone se dejan vacíos (`''`, `null` o `[]`) y se documentan en cada mapper.
 *   No se rellenan con datos de ejemplo.
 * - La API decide tenant, rol y autor. Estos mappers solo leen lo que el servidor devuelve.
 */
import type { EventComment, EventType, Operation, OperationEvent, OperationStatus, TransportType, Visibility } from '@/types/domain'
import { PortalApiError } from './http-client'

/** Estados de operación conocidos. Debe coincidir con OPERATION_STATUSES (ver mappers.test.ts). */
export const KNOWN_OPERATION_STATUSES: readonly OperationStatus[] = [
  'Creado',
  'En tránsito',
  'En puerto',
  'En aduana',
  'Pendiente cliente',
  'Entregado',
  'Cerrado',
]

const KNOWN_EVENT_TYPES: readonly EventType[] = ['status_change', 'news', 'document', 'action_required']

// --- Modelos de la capa API (camelCase, sin campos que el servidor no expone) -----------------------

export interface TenantSummary {
  id: string
  slug: string
  legalName: string
}

export interface MembershipSummary {
  tenantId: string
  role: string
}

/** Cuenta autenticada tal como la resuelve el servidor (GET /api/v1/me). */
export interface CurrentAccount {
  userId: string
  fullName: string
  tenant: TenantSummary
  role: string
  canComment: boolean
  memberships: MembershipSummary[]
}

/**
 * Referencia de operación con los datos que la API v1 expone hoy. El modelo `Operation` del dominio
 * exige tipo, transporte, origen, destino y fechas que la API no devuelve (ver docs/fastapi-integration.md).
 */
export interface OperationSummary {
  id: string
  tenantId: string
  doNumber: string
  reference: string | null
  lastKnownStatus: OperationStatus | null
  lastSyncedAt: string | null
}

// --- Validadores primitivos ----------------------------------------------------------------------

function invalid(field: string): PortalApiError {
  return new PortalApiError('invalid_response', `Respuesta no válida: campo "${field}".`, 200)
}

function requireString(source: unknown, field: string): string {
  const value = (source as Record<string, unknown> | null)?.[field]
  if (typeof value !== 'string' || value.length === 0) throw invalid(field)
  return value
}

function optionalString(source: Record<string, unknown>, field: string): string | null {
  const value = source[field]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw invalid(field)
  return value
}

function requireBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field]
  if (typeof value !== 'boolean') throw invalid(field)
  return value
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(field)
  return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(field)
  return value
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw invalid(field)
  return value as T
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | null {
  if (value === null || value === undefined) return null
  return requireOneOf(value, allowed, field)
}

// --- Mappers -------------------------------------------------------------------------------------

export function toCurrentAccount(payload: unknown): CurrentAccount {
  const src = requireObject(payload, 'me')
  const tenant = requireObject(src.tenant, 'tenant')
  return {
    userId: requireString(src, 'user_id'),
    fullName: requireString(src, 'full_name'),
    tenant: {
      id: requireString(tenant, 'id'),
      slug: requireString(tenant, 'slug'),
      legalName: requireString(tenant, 'legal_name'),
    },
    role: requireString(src, 'role'),
    canComment: requireBoolean(src, 'can_comment'),
    memberships: requireArray(src.memberships, 'memberships').map((item) => {
      const m = requireObject(item, 'memberships')
      return { tenantId: requireString(m, 'tenant_id'), role: requireString(m, 'role') }
    }),
  }
}

/**
 * `tenantId` llega del contexto autenticado (no de la respuesta), porque el listado de operaciones
 * pertenece siempre a la empresa activa. La API no devuelve `tenant_id` en cada fila.
 */
export function toOperationSummary(payload: unknown, tenantId: string): OperationSummary {
  const src = requireObject(payload, 'operation')
  return {
    id: requireString(src, 'id'),
    tenantId,
    doNumber: requireString(src, 'do_number'),
    reference: optionalString(src, 'reference'),
    lastKnownStatus: optionalOneOf(src.last_known_status, KNOWN_OPERATION_STATUSES, 'last_known_status'),
    lastSyncedAt: optionalString(src, 'last_synced_at'),
  }
}

/**
 * La API solo devuelve eventos con visibilidad `client`: los internos no existen en la respuesta.
 * `attachmentIds` queda vacío porque la API v1 todavía no expone adjuntos de eventos.
 */
export function toOperationEvent(payload: unknown, tenantId: string, operationId: string): OperationEvent {
  const src = requireObject(payload, 'event')
  return {
    id: requireString(src, 'id'),
    tenantId,
    operationId,
    type: requireOneOf(src.event_type, KNOWN_EVENT_TYPES, 'event_type'),
    occurredAt: requireString(src, 'occurred_at'),
    author: optionalString(src, 'author_name') ?? '',
    authorId: null,
    title: requireString(src, 'title'),
    description: optionalString(src, 'description') ?? '',
    fromStatus: optionalOneOf(src.from_status, KNOWN_OPERATION_STATUSES, 'from_status'),
    toStatus: optionalOneOf(src.to_status, KNOWN_OPERATION_STATUSES, 'to_status'),
    visibility: 'client' satisfies Visibility,
    attachmentIds: [],
  }
}

/**
 * La API nunca devuelve `author_id` (decisión de privacidad y de aislamiento). `authorId` queda como
 * cadena vacía: la interfaz no lo usa para mostrar ni autorizar nada. No debe usarse para decisiones.
 * Los comentarios de la API siempre son visibles para el cliente.
 */
export function toEventComment(payload: unknown, tenantId: string, operationId: string): EventComment {
  const src = requireObject(payload, 'comment')
  const side = requireOneOf(src.author_side, ['client', 'operator'] as const, 'author_side')
  return {
    id: requireString(src, 'id'),
    tenantId,
    operationId,
    eventId: requireString(src, 'event_id'),
    parentCommentId: optionalString(src, 'parent_comment_id'),
    authorId: '',
    authorName: requireString(src, 'author_name'),
    authorSide: side,
    body: requireString(src, 'body'),
    createdAt: requireString(src, 'created_at'),
    visibility: 'client',
  }
}

/** Cuerpo de la petición de creación. Solo contiene lo que el cliente puede elegir. */
export function toCommentCreateBody(input: { body: string; parentCommentId: string | null }): {
  body: string
  parent_comment_id: string | null
} {
  return { body: input.body, parent_comment_id: input.parentCommentId }
}

/** Convierte una lista de la API aplicando `map` a cada elemento. Falla si la respuesta no es un arreglo. */
export function mapList<T>(payload: unknown, map: (item: unknown) => T): T[] {
  return requireArray(payload, 'list').map(map)
}

const KNOWN_TRANSPORT: readonly TransportType[] = ['Marítimo FCL', 'Marítimo LCL', 'Aéreo', 'Terrestre']

/**
 * Operación del dominio a partir de la respuesta de la API (cliente o personal).
 * Devuelve null si el estado no es uno de los conocidos: no se muestra una operación con estado inventado.
 * Los campos sin información llegan como null y se muestran como «No informado» en la interfaz.
 */
export function toOperationFromDto(payload: unknown, tenantId: string): Operation | null {
  const src = requireObject(payload, 'operation')
  const status = optionalOneOf(src.last_known_status, KNOWN_OPERATION_STATUSES, 'last_known_status')
  if (status === null) return null
  const transport = optionalOneOf(src.transport_type, KNOWN_TRANSPORT, 'transport_type')
  const synced = optionalString(src, 'last_synced_at')
  const pending = typeof src.pending_client_response === 'boolean' ? src.pending_client_response : null
  return {
    id: requireString(src, 'id'),
    tenantId,
    doNumber: requireString(src, 'do_number'),
    reference: optionalString(src, 'reference'),
    status,
    kind: null,
    transport,
    owner: optionalString(src, 'responsible_name'),
    ordenNumber: null,
    booking: optionalString(src, 'booking_number'),
    carrier: optionalString(src, 'carrier_name'),
    origin: optionalString(src, 'origin_name'),
    destination: optionalString(src, 'destination_name'),
    etd: optionalString(src, 'etd'),
    eta: optionalString(src, 'eta'),
    atd: null,
    ata: null,
    freeDays: null,
    documentClosingDate: null,
    createdAt: synced ?? '',
    updatedAt: synced ?? '',
    pendingClientResponse: pending,
  }
}
