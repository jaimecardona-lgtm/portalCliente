/**
 * Tipo de cuenta en modo Supabase: personal interno o cliente externo.
 *
 * Responsabilidad: preguntar UNA vez al servidor (GET /api/v1/staff/me) si la sesión actual tiene un rol interno
 * activo, y compartir ese resultado entre el enrutador, el contexto de sesión y el login.
 * Reglas:
 * - Solo un 403 `no_staff_role` significa "cliente". Un error de red, de servidor o de token NO concede nada: se
 *   devuelve `unknown` y la interfaz muestra "no disponible", nunca una cuenta de cliente ni de personal.
 * - `unknown` no se guarda en caché, para que la siguiente navegación vuelva a preguntar.
 * - El servidor sigue siendo la única autoridad: esta función solo decide qué pantalla mostrar.
 */
import { PortalApiError } from '@/services/api/http-client'
import type { StaffApi, StaffMe } from '@/services/api/staff-api'
import { loadSupabasePortal } from '@/services/auth/supabase-runtime'

export type StaffStatus = { kind: 'staff'; me: StaffMe } | { kind: 'client' } | { kind: 'unknown' }

let cached: Promise<StaffStatus> | null = null

/** Resultado memoizado para la sesión actual. Debe reiniciarse en cada cambio de sesión. */
export function staffStatusFor(staff: StaffApi): Promise<StaffStatus> {
  if (!cached) {
    cached = staff.me().then(
      (me): StaffStatus => ({ kind: 'staff', me }),
      (error: unknown): StaffStatus => {
        if (error instanceof PortalApiError && error.code === 'no_staff_role') return { kind: 'client' }
        cached = null
        return { kind: 'unknown' }
      },
    )
  }
  return cached
}

/** Olvida el resultado anterior (inicio, cierre o cambio de sesión en Supabase). */
export function resetStaffStatus(): void {
  cached = null
}

/** Estado para guardas de ruta. Sin portal o sin token, es `unknown`: nunca concede acceso. */
export async function loadStaffStatus(): Promise<StaffStatus> {
  const portal = await loadSupabasePortal()
  if (!portal || !(await portal.auth.accessToken())) return { kind: 'unknown' }
  return staffStatusFor(portal.staff)
}
