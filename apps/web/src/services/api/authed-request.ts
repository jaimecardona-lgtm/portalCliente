/**
 * Envío autenticado a la API (JWT de Supabase en Authorization), compartido por los clientes de documentos y de
 * personal interno.
 *
 * Reglas:
 * - Sin token no hay petición de red.
 * - Sin cookies (credentials omit). Tiempo máximo configurable. Errores del servidor → PortalApiError con código.
 * - Un cuerpo que no es JSON en una respuesta correcta se devuelve como null.
 */
import { PortalApiError, apiRootFor, normalizeBaseUrl } from './http-client'

export type AuthedMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface AuthedRequestOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface AuthedRequester {
  send(method: AuthedMethod, path: string, init?: { body?: BodyInit; headers?: Record<string, string> }): Promise<unknown>
}

const DEFAULT_TIMEOUT_MS = 60_000

export function createAuthedRequester(options: AuthedRequestOptions): AuthedRequester {
  const root = apiRootFor(normalizeBaseUrl(options.baseUrl))
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async send(method, path, init = {}) {
      const token = await options.getToken()
      if (!token) throw new PortalApiError('authentication_required', 'Debe iniciar sesión para continuar.', 401)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetchImpl(`${root}${path}`, {
          method,
          body: init.body,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
          credentials: 'omit',
          signal: controller.signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new PortalApiError('timeout', 'La operación tardó demasiado.', 0)
        }
        throw new PortalApiError('network_error', 'No hay conexión con el servidor.', 0)
      } finally {
        clearTimeout(timer)
      }

      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const body = (payload as { error?: { code?: unknown; request_id?: unknown } } | null)?.error
        const code = typeof body?.code === 'string' ? body.code : 'http_error'
        const requestId = typeof body?.request_id === 'string' ? body.request_id : null
        throw new PortalApiError(code, 'El servidor rechazó la operación.', response.status, requestId)
      }
      return payload
    },
  }
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new PortalApiError('not_found', 'Identificador no válido.', 404)
}
