/**
 * Cliente de Logix: POST /api/v1/logix/chat con el token de Supabase y, si hay empresa activa, X-Tenant-Id.
 *
 * Responsabilidad: enviar una pregunta y devolver la respuesta tal como la declara el servidor (origen y empresa).
 * Reglas: nunca se envía historial. La clave de OpenRouter vive solo en el backend. Un fallo de red o del servidor se
 * devuelve como error tipado; la interfaz no inventa una respuesta.
 */
import { createAuthedRequester } from '@/services/api/authed-request'
import { PortalApiError } from '@/services/api/http-client'

export type LogixAnswerKind = 'deterministic' | 'model' | 'unavailable' | 'provider_failure'

export interface LogixReply {
  answer: string
  answerKind: LogixAnswerKind
  tenant: string | null
  sources: string[]
}

export interface LogixApiOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

export interface LogixApi {
  ask(message: string, tenantId: string | null): Promise<LogixReply>
}

const KINDS: readonly LogixAnswerKind[] = ['deterministic', 'model', 'unavailable', 'provider_failure']

function toReply(raw: unknown): LogixReply {
  const r = (raw ?? {}) as Record<string, unknown>
  const kind = KINDS.includes(r.answer_kind as LogixAnswerKind) ? (r.answer_kind as LogixAnswerKind) : null
  if (typeof r.answer !== 'string' || kind === null) {
    throw new PortalApiError('invalid_response', 'Respuesta de Logix no válida.', 502)
  }
  return {
    answer: r.answer,
    answerKind: kind,
    tenant: typeof r.tenant === 'string' ? r.tenant : null,
    sources: Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === 'string') : [],
  }
}

export function createLogixApi(options: LogixApiOptions): LogixApi {
  const requester = createAuthedRequester({
    baseUrl: options.baseUrl,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
    timeoutMs: 45_000,
  })
  return {
    async ask(message, tenantId) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tenantId) headers['X-Tenant-Id'] = tenantId
      const data = await requester.send('POST', '/logix/chat', { body: JSON.stringify({ message }), headers })
      return toReply(data)
    },
  }
}

/** Texto visible de origen de la respuesta. Nunca afirma que el asistente esté conectado. */
export function answerKindLabel(kind: LogixAnswerKind): string {
  switch (kind) {
    case 'deterministic':
      return 'Dato consultado en la empresa activa'
    case 'model':
      return 'Respuesta generada por IA (conocimiento general)'
    case 'unavailable':
      return 'Conocimiento general no disponible'
    case 'provider_failure':
      return 'Problema temporal con el proveedor de IA'
  }
}
