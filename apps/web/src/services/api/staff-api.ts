/**
 * Cliente HTTP del personal interno (/api/v1/staff). Solo lectura y selección de contexto en esta fase.
 *
 * Reglas:
 * - El servidor decide. Un tenant no asignado o no verificado responde igual que uno inexistente.
 * - El tenant de trabajo se guarda solo en memoria de la pantalla: nunca en localStorage ni en la URL.
 * - No hay datos de todos los tenants: la lista llega ya filtrada por asignación y verificación.
 */
import { PortalApiError } from './http-client'
import { assertUuid, createAuthedRequester } from './authed-request'

export interface StaffMe {
  userId: string
  fullName: string
  staffRole: string
  permissions: string[]
}

export interface StaffTenant {
  id: string
  slug: string
  legalName: string
  externalTenantId: string | null
}

export interface StaffOperation {
  id: string
  tenantId: string
  doNumber: string
  reference: string | null
  lastKnownStatus: string | null
  lastSyncedAt: string | null
  /** Datos de presentación en bruto (snake_case del servidor). Se mapean en mappers.ts. */
  raw: Record<string, unknown>
}

export interface StaffApi {
  me(): Promise<StaffMe>
  tenants(): Promise<StaffTenant[]>
  /** Cambio de empresa de trabajo. El motivo de soporte es obligatorio y queda auditado en el servidor. */
  selectContext(tenantId: string, reason: string): Promise<StaffTenant>
  exitContext(): Promise<void>
  operations(tenantId: string): Promise<StaffOperation[]>
  /** Eventos visibles para el cliente de una operación de la empresa seleccionada. */
  operationEvents(tenantId: string, operationId: string): Promise<unknown[]>
}

export interface StaffApiOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new PortalApiError('invalid_response', `Respuesta no válida: ${field}.`, 200)
  return value
}

export function toStaffMe(raw: unknown): StaffMe {
  const r = raw as Record<string, unknown>
  const permissions = Array.isArray(r.permissions) ? r.permissions.filter((p): p is string => typeof p === 'string') : []
  return {
    userId: requireString(r.user_id, 'user_id'),
    fullName: requireString(r.full_name, 'full_name'),
    staffRole: requireString(r.staff_role, 'staff_role'),
    permissions,
  }
}

export function toStaffTenant(raw: unknown): StaffTenant {
  const r = raw as Record<string, unknown>
  return {
    id: requireString(r.id, 'id'),
    slug: requireString(r.slug, 'slug'),
    legalName: requireString(r.legal_name, 'legal_name'),
    externalTenantId: typeof r.external_tenant_id === 'string' ? r.external_tenant_id : null,
  }
}

export function toStaffOperation(raw: unknown): StaffOperation {
  const r = raw as Record<string, unknown>
  return {
    id: requireString(r.id, 'id'),
    tenantId: requireString(r.tenant_id, 'tenant_id'),
    doNumber: requireString(r.do_number, 'do_number'),
    reference: typeof r.reference === 'string' ? r.reference : null,
    lastKnownStatus: typeof r.last_known_status === 'string' ? r.last_known_status : null,
    lastSyncedAt: typeof r.last_synced_at === 'string' ? r.last_synced_at : null,
    raw: r,
  }
}

/** Mensaje para el personal. Un tenant no asignado y uno inexistente se presentan igual. */
export function staffErrorMessage(error: unknown): string {
  if (!(error instanceof PortalApiError)) return 'No hay conexión con el servidor. Inténtelo de nuevo.'
  switch (error.code) {
    case 'authentication_required':
    case 'invalid_token':
      return 'Su sesión caducó. Inicie sesión de nuevo para continuar.'
    case 'no_staff_role':
      return 'Su cuenta no tiene un rol interno autorizado para este panel.'
    case 'permission_denied':
      return 'Su rol no tiene permiso para esta acción.'
    case 'tenant_not_authorized':
      return 'No tiene acceso a esa empresa, o todavía no está verificada.'
    case 'timeout':
      return 'La operación tardó demasiado. Inténtelo de nuevo.'
    case 'network_error':
      return 'No hay conexión con el servidor. Inténtelo de nuevo.'
    default:
      return 'No fue posible completar la operación. Inténtelo de nuevo.'
  }
}

export function createStaffApi(options: StaffApiOptions): StaffApi {
  const requester = createAuthedRequester({
    baseUrl: options.baseUrl,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  return {
    async me() {
      return toStaffMe(await requester.send('GET', '/staff/me'))
    },
    async tenants() {
      const data = (await requester.send('GET', '/staff/tenants')) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toStaffTenant)
    },
    async selectContext(tenantId, reason) {
      assertUuid(tenantId)
      const data = (await requester.send('POST', '/staff/context', {
        body: JSON.stringify({ tenant_id: tenantId, reason: reason.trim() }),
        headers: { 'Content-Type': 'application/json' },
      })) as { tenant?: unknown } | null
      return toStaffTenant(data?.tenant)
    },
    async exitContext() {
      await requester.send('POST', '/staff/context/exit')
    },
    async operations(tenantId) {
      assertUuid(tenantId)
      const data = (await requester.send('GET', `/staff/tenants/${tenantId}/operations`)) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toStaffOperation)
    },
    async operationEvents(tenantId, operationId) {
      assertUuid(tenantId)
      assertUuid(operationId)
      const data = (await requester.send('GET', `/staff/tenants/${tenantId}/operations/${operationId}/events`)) as { items?: unknown[] } | null
      return data?.items ?? []
    },
  }
}
