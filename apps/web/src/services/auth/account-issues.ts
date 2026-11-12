/**
 * Traducción de los errores de la cuenta (GET /api/v1/me) a estados que la interfaz puede mostrar.
 *
 * Responsabilidad: decidir qué le pasa a la persona y qué texto neutro ver. No revela códigos técnicos ni
 * identificadores. El servidor sigue siendo la única autoridad sobre empresa y permisos.
 * Reglas: un error desconocido se trata como "no disponible", nunca como una cuenta válida sin datos.
 */
import { PortalApiError } from '@/services/api/http-client'

export type AccountIssue = 'session' | 'no-membership' | 'suspended' | 'tenant-selection' | 'unavailable'

/** Estado de la cuenta a partir del error de la consulta, o null si no hay error. */
export function accountIssueFor(error: unknown): AccountIssue | null {
  if (error === null || error === undefined) return null
  if (!(error instanceof PortalApiError)) return 'unavailable'
  switch (error.code) {
    case 'authentication_required':
    case 'invalid_token':
      return 'session'
    case 'no_tenant_membership':
      return 'no-membership'
    case 'tenant_inactive':
    case 'profile_inactive':
      return 'suspended'
    case 'tenant_selection_required':
      return 'tenant-selection'
    default:
      return 'unavailable'
  }
}

const MESSAGES: Record<AccountIssue, string> = {
  session: 'Tu sesión caducó. Inicia sesión de nuevo para continuar.',
  'no-membership': 'Tu cuenta todavía no tiene una empresa asignada. Contacta a tu ejecutivo de cuenta.',
  suspended: 'Tu acceso está suspendido. Contacta a tu ejecutivo de cuenta.',
  'tenant-selection': 'Tu cuenta tiene acceso a varias empresas. La selección de empresa todavía no está disponible en el portal.',
  unavailable: 'La información de tu cuenta no está disponible en este momento. Inténtalo más tarde.',
}

export function accountIssueMessage(issue: AccountIssue): string {
  return MESSAGES[issue]
}

const ROLE_LABELS: Record<string, string> = {
  client_admin: 'Administrador de empresa',
  client_member: 'Miembro del equipo',
  client_viewer: 'Solo lectura',
}

/** Nombre visible de un rol del servidor. Un rol desconocido no se muestra tal cual. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? 'Usuario del portal'
}
