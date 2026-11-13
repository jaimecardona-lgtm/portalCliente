/**
 * Empresa de trabajo del personal interno (solo memoria de la pestaña).
 *
 * Responsabilidad: recordar qué empresa verificada eligió la persona de soporte para que el selector del sidebar y el
 * panel de soporte muestren la misma. No es autorización: el servidor valida cada consulta con POST /staff/context.
 * Reglas: no se guarda en la URL, en localStorage ni en sessionStorage. Se borra al cambiar o cerrar la sesión.
 */
import { useSyncExternalStore } from 'react'
import type { StaffTenant } from '@/services/api/staff-api'

let active: StaffTenant | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): StaffTenant | null {
  return active
}

/** Empresa activa, o null si no hay contexto de trabajo. */
export function useActiveStaffTenant(): StaffTenant | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Fija o limpia la empresa de trabajo. La llamada al servidor la hace quien selecciona. */
export function setActiveStaffTenant(tenant: StaffTenant | null): void {
  active = tenant
  listeners.forEach((listener) => listener())
}
