/**
 * Cliente HTTP mínimo y tipado para la API FastAPI del portal.
 *
 * Responsabilidad: enviar peticiones con el token de Supabase, validar la URL base, aplicar un tiempo de
 * espera y convertir cualquier fallo en `PortalApiError` con un código estable. No conoce el dominio.
 *
 * Reglas:
 * - El token lo entrega `getToken()`. Sin token no hay petición de red: se responde 401 local.
 * - `credentials: 'omit'`: la autenticación viaja solo en la cabecera Authorization, nunca en cookies.
 * - `X-Tenant-Id` se envía solo si el usuario eligió empresa entre sus membresías. El servidor la valida;
 *   este cliente tampoco la inventa.
 * - Los errores de la API llegan en el sobre `{ error: { code, message, request_id } }`. Si no existe o
 *   no es válido, el código es `http_error` o `invalid_response`.
 */

export type PortalApiErrorCode =
  | 'authentication_required'
  | 'invalid_token'
  | 'access_denied'
  | 'not_found'
  | 'validation_error'
  | 'auth_not_configured'
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'not_available_in_api'
  | 'tenant_not_authorized'
  | (string & {})

export class PortalApiError extends Error {
  readonly code: PortalApiErrorCode
  /** 0 cuando no hubo respuesta HTTP (red, tiempo de espera, configuración local). */
  readonly status: number
  readonly requestId: string | null

  constructor(code: PortalApiErrorCode, message: string, status: number, requestId: string | null = null) {
    super(message)
    this.name = 'PortalApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
}

export interface ApiClientOptions {
  /** URL base de la API sin barra final, p. ej. https://api.ejemplo.test */
  baseUrl: string
  /** Devuelve el token de acceso de la sesión actual, o null si no hay sesión. */
  getToken: () => Promise<string | null>
  /** Empresa elegida por el usuario entre sus membresías. Opcional. */
  tenantId?: string
  /** Tiempo máximo de espera por petición. */
  timeoutMs?: number
  /** Inyectable para pruebas. Por defecto, fetch global. */
  fetchImpl?: typeof fetch
}

export interface ApiClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

const DEFAULT_TIMEOUT_MS = 15_000
const API_PREFIX = '/api/v1'

/** Valida y normaliza la URL base. Solo http(s) y sin credenciales embebidas. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new PortalApiError('invalid_response', 'La URL de la API no es válida.', 0)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new PortalApiError('invalid_response', 'La URL de la API debe usar http o https.', 0)
  }
  if (url.username || url.password) {
    throw new PortalApiError('invalid_response', 'La URL de la API no puede contener credenciales.', 0)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Convierte el cuerpo de error de la API en PortalApiError. Sin sobre válido, usa un código genérico. */
export function errorFromPayload(status: number, payload: unknown): PortalApiError {
  const body = (payload as { error?: { code?: unknown; message?: unknown; request_id?: unknown } } | null)?.error
  if (body && typeof body.code === 'string' && typeof body.message === 'string') {
    const requestId = typeof body.request_id === 'string' ? body.request_id : null
    return new PortalApiError(body.code, body.message, status, requestId)
  }
  return new PortalApiError('http_error', 'El servicio respondió con un error inesperado.', status)
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function send<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await options.getToken()
    if (!token) {
      throw new PortalApiError('authentication_required', 'Debe iniciar sesión para continuar.', 401)
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }
    if (options.tenantId) headers['X-Tenant-Id'] = options.tenantId
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${API_PREFIX}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PortalApiError('timeout', 'El servicio tardó demasiado en responder.', 0)
      }
      throw new PortalApiError('network_error', 'No se pudo conectar con el servicio.', 0)
    } finally {
      clearTimeout(timer)
    }

    let payload: unknown = null
    const text = await response.text()
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        if (response.ok) throw new PortalApiError('invalid_response', 'Respuesta no válida del servicio.', response.status)
      }
    }

    if (!response.ok) throw errorFromPayload(response.status, payload)
    return payload as T
  }

  return {
    get: <T,>(path: string) => send<T>('GET', path),
    post: <T,>(path: string, body: unknown) => send<T>('POST', path, body),
  }
}
