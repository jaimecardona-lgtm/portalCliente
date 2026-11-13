/**
 * Repositorio remoto del portal: implementa `PortalRepository` contra la API FastAPI.
 *
 * Estado: NO está conectado a las pantallas. El repositorio mock sigue siendo el de desarrollo hasta que
 * exista autenticación real (Supabase Auth). Ver docs/fastapi-integration.md.
 *
 * Reglas:
 * - La empresa activa la decide el servidor (GET /api/v1/me), según las membresías del usuario.
 *   Cualquier método recibe `tenantId`, pero solo se consulta si coincide con esa empresa activa.
 *   Si no coincide, se responde null o [] sin enviar nada a la red.
 * - Un identificador que no es UUID no llega a la red: se trata como inexistente.
 * - Los métodos que la API v1 todavía no cubre rechazan con `PortalApiError('not_available_in_api')`.
 *   No devuelven datos de relleno.
 * - Las escrituras envían solo el texto y el padre del comentario. Autor, lado y empresa los fija el servidor.
 */
import type { NewEventCommentInput, PortalRepository } from '@/services/repositories/portal-repository'
import type {
  Address,
  Attachment,
  Contact,
  DocumentRecord,
  EventComment as EventCommentModel,
  ID,
  Operation,
  OperationEvent,
  Quote,
  Request,
  User,
} from '@/types/domain'
import {
  createApiClient,
  PortalApiError,
  type ApiClient,
  type ApiClientOptions,
} from './http-client'
import {
  mapList,
  toCommentCreateBody,
  toCurrentAccount,
  toEventComment,
  toOperationEvent,
  toOperationFromDto,
  toOperationSummary,
  type CurrentAccount,
  type OperationSummary,
} from './mappers'
import type { CommentDto, EventDto, OperationDto } from './api-types'
import type { StaffApi } from './staff-api'
import { REQUEST_TYPE_TO_DB, requestFromStaff, requestsFromStaff } from './request-mapping'

// Re-exportado para que quien consuma el repositorio remoto tenga los modelos de la capa API a mano.
export type { CurrentAccount, OperationSummary } from './mappers'

/** Repositorio remoto: el contrato del dominio más los métodos que la API v1 sí cubre. */
export interface HttpPortalRepository extends PortalRepository {
  /** Cuenta autenticada y empresa activa, tal como las resuelve el servidor. Se cachea en la instancia. */
  getCurrentAccount(): Promise<CurrentAccount>
  /**
   * Vuelve a pedir la cuenta al servidor, ignorando la caché de la instancia. Úsela tras iniciar o cerrar
   * sesión: una cuenta cacheada de otra persona nunca debe mostrarse.
   */
  refreshCurrentAccount(): Promise<CurrentAccount>
  /** Referencias de operación de la empresa activa (paginadas por el servidor). */
  listOperationSummaries(tenantId: ID, page?: { limit?: number; offset?: number }): Promise<OperationSummary[]>
  /** Referencia de una operación de la empresa activa, o null si no existe o es de otra empresa. */
  getOperationSummary(tenantId: ID, operationId: ID): Promise<OperationSummary | null>
}

export interface HttpPortalRepositoryOptions extends Omit<ApiClientOptions, 'tenantId'> {
  /**
   * Empresa que el usuario eligió entre sus membresías (cabecera X-Tenant-Id). Solo es necesaria si el
   * usuario pertenece a varias empresas. El servidor valida que sea una membresía suya.
   */
  selectedTenantId?: string
  /** Empresa de trabajo del personal interno (memoria de la pestaña). null si no hay ninguna. */
  staffTenantId?: () => string | null
  /** Cliente de la API de personal. Solo se usa para la empresa de trabajo seleccionada. */
  staffApi?: StaffApi
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Funciones que el dominio tiene y la API v1 todavía no. El mensaje es visible para la persona: no revela
 * el nombre interno del método y la pantalla lo muestra como "información no disponible" (sin datos de ejemplo).
 */
function notAvailable(_method: string): PortalApiError {
  return new PortalApiError(
    'not_available_in_api',
    'Esta información todavía no está disponible en el portal.',
    0,
  )
}

function isNotFound(error: unknown): boolean {
  return error instanceof PortalApiError && error.status === 404
}

/** Un identificador no UUID no puede existir: no se envía a la red (evita rutas manipuladas). */
function isId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function createHttpPortalRepository(options: HttpPortalRepositoryOptions): HttpPortalRepository {
  const { selectedTenantId, staffTenantId, staffApi, ...clientOptions } = options
  // Solo la empresa de trabajo del personal usa la API de personal. Cualquier otra empresa exige membresía.
  const isStaffTenant = (tenantId: ID): boolean => Boolean(staffApi && staffTenantId && staffTenantId() === tenantId)
  const client: ApiClient = createApiClient({ ...clientOptions, tenantId: selectedTenantId })

  let accountPromise: Promise<CurrentAccount> | null = null

  function getCurrentAccount(): Promise<CurrentAccount> {
    if (!accountPromise) {
      accountPromise = client
        .get<unknown>('/me')
        .then(toCurrentAccount)
        .catch((error: unknown) => {
          // Sin caché de errores: la siguiente llamada vuelve a preguntar al servidor.
          accountPromise = null
          throw error
        })
    }
    return accountPromise
  }

  function refreshCurrentAccount(): Promise<CurrentAccount> {
    accountPromise = null
    return getCurrentAccount()
  }

  /** true solo si `tenantId` es la empresa activa según el servidor. */
  async function isActiveTenant(tenantId: ID): Promise<boolean> {
    if (!isId(tenantId)) return false
    const account = await getCurrentAccount()
    return account.tenant.id === tenantId
  }

  function operationPath(operationId: ID): string {
    return `/operations/${encodeURIComponent(operationId)}`
  }

  const repository: HttpPortalRepository = {
    getCurrentAccount,
    refreshCurrentAccount,

    // --- Empresa --------------------------------------------------------------------------------
    // La API v1 solo expone la empresa activa con nombre y slug. El modelo Tenant del dominio exige
    // datos fiscales, segmento, gestor de cuenta y color que la API no devuelve.
    async getTenant() {
      throw notAvailable('getTenant')
    },
    async listTenants() {
      throw notAvailable('listTenants')
    },

    // --- Usuarios, direcciones y contactos (no expuestos por la API v1) -------------------------
    async listUsers(): Promise<User[]> {
      throw notAvailable('listUsers')
    },
    async getUser(): Promise<User | null> {
      throw notAvailable('getUser')
    },
    async listAddresses(): Promise<Address[]> {
      throw notAvailable('listAddresses')
    },
    async listContacts(): Promise<Contact[]> {
      throw notAvailable('listContacts')
    },

    // --- Operaciones -----------------------------------------------------------------------------
    // El modelo Operation del dominio exige tipo, transporte, origen, destino y fechas que la API
    // no expone. Usar listOperationSummaries / getOperationSummary hasta ampliar el contrato.
    async listOperations(tenantId): Promise<Operation[]> {
      if (isStaffTenant(tenantId)) {
        const rows = await staffApi!.operations(tenantId)
        return rows.map((row) => toOperationFromDto(row.raw, tenantId)).filter((op): op is Operation => op !== null)
      }
      if (!(await isActiveTenant(tenantId))) return []
      const rows = await client.get<unknown[]>('/operations?limit=500')
      return mapList(rows, (item) => toOperationFromDto(item, tenantId)).filter((op): op is Operation => op !== null)
    },
    async getOperation(tenantId, operationId): Promise<Operation | null> {
      if (!isId(operationId)) return null
      const all = await this.listOperations(tenantId)
      return all.find((op) => op.id === operationId) ?? null
    },

    async listOperationSummaries(tenantId, page = {}) {
      if (!(await isActiveTenant(tenantId))) return []
      const params = new URLSearchParams()
      if (page.limit !== undefined) params.set('limit', String(page.limit))
      if (page.offset !== undefined) params.set('offset', String(page.offset))
      const search = params.toString()
      const query = search ? `?${search}` : ''
      const rows = await client.get<unknown>(`/operations${query}`)
      return mapList(rows, (item) => toOperationSummary(item, tenantId))
    },

    async getOperationSummary(tenantId, operationId) {
      if (!(await isActiveTenant(tenantId)) || !isId(operationId)) return null
      try {
        const row = await client.get<OperationDto>(operationPath(operationId))
        return toOperationSummary(row, tenantId)
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    // --- Eventos ---------------------------------------------------------------------------------
    async listOperationEvents(tenantId, operationId): Promise<OperationEvent[]> {
      if (isStaffTenant(tenantId)) {
        if (!isId(operationId)) return []
        const rows = await staffApi!.operationEvents(tenantId, operationId)
        return mapList(rows, (item) => toOperationEvent(item, tenantId, operationId))
      }
      if (!(await isActiveTenant(tenantId)) || !isId(operationId)) return []
      try {
        const rows = await client.get<EventDto[]>(`${operationPath(operationId)}/events`)
        return mapList(rows, (item) => toOperationEvent(item, tenantId, operationId))
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
    },

    // --- Comentarios -----------------------------------------------------------------------------
    async listEventComments(tenantId, operationId, eventId, options): Promise<EventCommentModel[]> {
      // La API nunca devuelve comentarios internos. Pedirlos desde el portal de clientes no tiene sentido.
      if (options?.includeInternal) throw notAvailable('listEventComments(includeInternal)')
      if (!(await isActiveTenant(tenantId)) || !isId(operationId) || !isId(eventId)) return []
      try {
        const rows = await client.get<CommentDto[]>(
          `${operationPath(operationId)}/events/${encodeURIComponent(eventId)}/comments`,
        )
        return mapList(rows, (item) => toEventComment(item, tenantId, operationId))
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
    },

    async addEventComment(tenantId, input: NewEventCommentInput): Promise<EventCommentModel> {
      // authorId, authorName y authorSide del input se ignoran a propósito: el servidor los fija.
      if (!(await isActiveTenant(tenantId)) || !isId(input.operationId) || !isId(input.eventId)) {
        throw new PortalApiError('not_found', 'El evento no existe.', 404)
      }
      const row = await client.post<CommentDto>(
        `${operationPath(input.operationId)}/events/${encodeURIComponent(input.eventId)}/comments`,
        toCommentCreateBody({ body: input.body, parentCommentId: input.parentCommentId }),
      )
      return toEventComment(row, tenantId, input.operationId)
    },

    // --- Adjuntos, documentos, cotizaciones y solicitudes (fuera de la API v1) ------------------
    async listAttachments(): Promise<Attachment[]> {
      throw notAvailable('listAttachments')
    },
    async getAttachment(): Promise<Attachment | null> {
      throw notAvailable('getAttachment')
    },
    async listDocuments(): Promise<DocumentRecord[]> {
      throw notAvailable('listDocuments')
    },
    async getDocument(): Promise<DocumentRecord | null> {
      throw notAvailable('getDocument')
    },
    async addDocumentVersion(): Promise<DocumentRecord> {
      throw notAvailable('addDocumentVersion')
    },
    async listQuotes(): Promise<Quote[]> {
      throw notAvailable('listQuotes')
    },
    async getQuote(): Promise<Quote | null> {
      throw notAvailable('getQuote')
    },
    async decideQuote(): Promise<Quote> {
      throw notAvailable('decideQuote')
    },
    // Solicitudes: personal interno mediante /staff/tenants/{id}/requests (RLS y permiso en el servidor).
    // La consulta de cliente final todavía no existe en la API: se declara como no disponible, sin datos.
    async listRequests(tenantId): Promise<Request[]> {
      if (isStaffTenant(tenantId)) return requestsFromStaff(await staffApi!.requests(tenantId))
      throw notAvailable('listRequests')
    },
    async createRequest(tenantId, input): Promise<Request> {
      if (isStaffTenant(tenantId)) {
        const created = await staffApi!.createRequest(tenantId, {
          requestType: REQUEST_TYPE_TO_DB[input.type],
          subject: input.subject,
          description: input.description,
          operationId: input.operationId,
        })
        return requestFromStaff(created)
      }
      throw notAvailable('createRequest')
    },
  }

  return repository
}
