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

export type TenantIntegrationStatus = 'pending_integration' | 'verified'

export interface StaffTenant {
  id: string
  slug: string
  legalName: string
  externalTenantId: string | null
  /** Derivado en la base de datos: 'verified' solo con verificación oficial; si no, pendiente. */
  integrationStatus: TenantIntegrationStatus
  /** Empresa sintética de la modalidad QA interna (segment QA_SYNTHETIC_ONLY). Nunca es integración oficial. */
  qaSynthetic: boolean
  discoveryObservedLabel: string | null
}

/**
 * Dos estados separados, siempre con texto e icono (nunca solo color):
 * - integración oficial con Logixtic (vinculada o pendiente);
 * - disponibilidad para revisión QA (solo empresas sintéticas autorizadas).
 * Una empresa puede estar pendiente de integración oficial y, a la vez, disponible para revisión QA.
 */
export function tenantCategory(t: Pick<StaffTenant, 'integrationStatus' | 'qaSynthetic'>): {
  officialLabel: string
  officialIcon: string
  qaLabel: string | null
} {
  const official =
    t.integrationStatus === 'verified'
      ? { officialLabel: 'Integración oficial con Logixtic: vinculada', officialIcon: '✓' }
      : { officialLabel: 'Integración oficial con Logixtic: pendiente', officialIcon: '◷' }
  return {
    ...official,
    qaLabel: t.qaSynthetic ? 'Disponible para revisión QA' : null,
  }
}

/** Texto obligatorio en las pantallas que muestran operaciones sintéticas (CLAUDE.md, modalidad QA). */
export const QA_BANNER = 'ENTORNO QA · DATOS DE PRUEBA'

export interface StaffClientAccount {
  id: string
  tenantId: string
  legalName: string
  taxId: string | null
  status: string
  origin: string
  createdAt: string
}

export interface StaffRequest {
  id: string
  tenantId: string
  number: string
  requestType: string
  subject: string
  description: string
  status: string
  origin: string
  createdAt: string
}

export const REQUEST_TYPES = [
  { value: 'consulta', label: 'Consulta' },
  { value: 'modificacion_datos', label: 'Modificación de datos' },
  { value: 'documentacion', label: 'Documentación' },
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'otro', label: 'Otro' },
] as const

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

/** Empresa observada en el catálogo de Logixtic. Sin identificador oficial ni operaciones. */
export interface ObservedTenant {
  label: string
  slug: string | null
  sourceSystem: string
  verificationStatus: string
  hasOfficialId: boolean
  integrationStatus: string
}

export interface StaffApi {
  me(): Promise<StaffMe>
  observedTenants(): Promise<ObservedTenant[]>
  tenants(): Promise<StaffTenant[]>
  /** Desafío para cambiar de empresa. Solo para empresas autorizadas; caduca y se usa una vez. */
  requestContextChallenge(tenantId: string): Promise<{ challengeId: string; expiresAt: string }>
  /** Cambio de empresa con la reautenticación reciente (token de Supabase con contraseña). */
  selectContext(tenantId: string, challengeId: string, reauthToken: string): Promise<StaffTenant>
  exitContext(): Promise<void>
  operations(tenantId: string): Promise<StaffOperation[]>
  clientAccounts(tenantId: string): Promise<StaffClientAccount[]>
  /** Cliente final creado desde el portal (procedencia portal_manual). Requiere permiso de registros. */
  createClientAccount(tenantId: string, input: { legalName: string; taxId?: string }): Promise<StaffClientAccount>
  requests(tenantId: string): Promise<StaffRequest[]>
  createRequest(
    tenantId: string,
    input: { requestType: string; subject: string; description: string },
  ): Promise<StaffRequest>
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
    integrationStatus: r.integration_status === 'verified' ? 'verified' : 'pending_integration',
    qaSynthetic: r.qa_synthetic === true,
    discoveryObservedLabel: typeof r.discovery_observed_label === 'string' ? r.discovery_observed_label : null,
  }
}

export function toClientAccount(raw: unknown): StaffClientAccount {
  const r = raw as Record<string, unknown>
  return {
    id: requireString(r.id, 'id'),
    tenantId: requireString(r.tenant_id, 'tenant_id'),
    legalName: requireString(r.legal_name, 'legal_name'),
    taxId: typeof r.tax_id === 'string' ? r.tax_id : null,
    status: requireString(r.status, 'status'),
    origin: requireString(r.origin, 'origin'),
    createdAt: requireString(r.created_at, 'created_at'),
  }
}

export function toStaffRequest(raw: unknown): StaffRequest {
  const r = raw as Record<string, unknown>
  return {
    id: requireString(r.id, 'id'),
    tenantId: requireString(r.tenant_id, 'tenant_id'),
    number: requireString(r.number, 'number'),
    requestType: requireString(r.request_type, 'request_type'),
    subject: requireString(r.subject, 'subject'),
    description: requireString(r.description, 'description'),
    status: requireString(r.status, 'status'),
    origin: requireString(r.origin, 'origin'),
    createdAt: requireString(r.created_at, 'created_at'),
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
    async observedTenants() {
      const data = (await requester.send('GET', '/staff/observed-tenants')) as { items?: Record<string, unknown>[] } | null
      return (data?.items ?? []).map((r) => ({
        label: requireString(r.label, 'label'),
        slug: typeof r.slug === 'string' ? r.slug : null,
        sourceSystem: typeof r.source_system === 'string' ? r.source_system : 'logixtic',
        verificationStatus: typeof r.verification_status === 'string' ? r.verification_status : 'unverified',
        hasOfficialId: r.has_official_id === true,
        integrationStatus: typeof r.integration_status === 'string' ? r.integration_status : 'no_vinculada',
      }))
    },
    async tenants() {
      const data = (await requester.send('GET', '/staff/tenants')) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toStaffTenant)
    },
    async requestContextChallenge(tenantId) {
      assertUuid(tenantId)
      const data = (await requester.send('POST', '/staff/context/challenge', {
        body: JSON.stringify({ tenant_id: tenantId }),
        headers: { 'Content-Type': 'application/json' },
      })) as { challenge_id?: unknown; expires_at?: unknown } | null
      return {
        challengeId: requireString(data?.challenge_id, 'challenge_id'),
        expiresAt: requireString(data?.expires_at, 'expires_at'),
      }
    },
    async selectContext(tenantId, challengeId, reauthToken) {
      assertUuid(tenantId)
      assertUuid(challengeId)
      const data = (await requester.send('POST', '/staff/context', {
        body: JSON.stringify({ tenant_id: tenantId, challenge_id: challengeId }),
        headers: { 'Content-Type': 'application/json', 'X-Reauth-Token': reauthToken },
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
    async clientAccounts(tenantId) {
      assertUuid(tenantId)
      const data = (await requester.send('GET', `/staff/tenants/${tenantId}/client-accounts`)) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toClientAccount)
    },
    async createClientAccount(tenantId, input) {
      assertUuid(tenantId)
      const body: Record<string, string> = { legal_name: input.legalName }
      if (input.taxId) body.tax_id = input.taxId
      const data = (await requester.send('POST', `/staff/tenants/${tenantId}/client-accounts`, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })) as { item?: unknown } | null
      return toClientAccount(data?.item)
    },
    async requests(tenantId) {
      assertUuid(tenantId)
      const data = (await requester.send('GET', `/staff/tenants/${tenantId}/requests`)) as { items?: unknown[] } | null
      return (data?.items ?? []).map(toStaffRequest)
    },
    async createRequest(tenantId, input) {
      assertUuid(tenantId)
      const data = (await requester.send('POST', `/staff/tenants/${tenantId}/requests`, {
        body: JSON.stringify({
          request_type: input.requestType,
          subject: input.subject,
          description: input.description,
        }),
        headers: { 'Content-Type': 'application/json' },
      })) as { item?: unknown } | null
      return toStaffRequest(data?.item)
    },
    async operationEvents(tenantId, operationId) {
      assertUuid(tenantId)
      assertUuid(operationId)
      const data = (await requester.send('GET', `/staff/tenants/${tenantId}/operations/${operationId}/events`)) as { items?: unknown[] } | null
      return data?.items ?? []
    },
  }
}
