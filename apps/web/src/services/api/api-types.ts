/**
 * Contratos JSON reales de la API FastAPI (`/api/v1`), tal como llegan por la red: `snake_case`.
 *
 * Fuente: apps/api/app/schemas/portal.py. Deben coincidir con el OpenAPI de la API (GET /openapi.json).
 * Estos tipos NO son el dominio del portal: la conversión a `camelCase` y a los modelos de
 * `src/types/domain.ts` la hace `mappers.ts`, campo a campo.
 *
 * Campos que la API no devuelve por diseño (no existen aquí y no deben añadirse en el cliente):
 * author_id de comentarios, identificadores externos de Logixtic, rutas de almacenamiento.
 */

export interface HealthDto {
  status: 'ok'
  version: string
}

export interface TenantDto {
  id: string
  slug: string
  legal_name: string
}

export interface MembershipDto {
  tenant_id: string
  role: string
}

export interface MeDto {
  user_id: string
  full_name: string
  tenant: TenantDto
  role: string
  can_comment: boolean
  memberships: MembershipDto[]
}

export interface OperationDto {
  id: string
  do_number: string
  reference: string | null
  last_known_status: string | null
  last_synced_at: string | null
}

export interface EventDto {
  id: string
  event_type: string
  occurred_at: string
  title: string
  description: string | null
  author_name: string | null
  from_status: string | null
  to_status: string | null
}

export interface CommentDto {
  id: string
  event_id: string
  parent_comment_id: string | null
  author_name: string
  author_side: 'client' | 'operator'
  body: string
  created_at: string
}

export interface CommentCreateDto {
  body: string
  parent_comment_id: string | null
}

/** Sobre de error único de la API (ver app/core/errors.py). */
export interface ErrorEnvelopeDto {
  error: {
    code: string
    message: string
    request_id: string
    fields?: Array<{ location: string; type: string }>
  }
}
