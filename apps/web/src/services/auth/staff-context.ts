/**
 * Empresa de trabajo del personal interno (solo memoria de la pestaña).
 *
 * Responsabilidad: recordar qué empresa verificada eligió la persona de soporte para que el selector del sidebar y el
 * panel de soporte muestren la misma. No es autorización: el servidor valida cada consulta con POST /staff/context.
 * Reglas: no se guarda en la URL ni en localStorage. Solo se persiste el UUID en sessionStorage (ver abajo).
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

/** Lectura sin hooks (para el repositorio, que no es un componente). */
export function getActiveStaffTenantId(): string | null {
  return active?.id ?? null
}

/** Fija o limpia la empresa de trabajo. La llamada al servidor la hace quien selecciona. */
export function setActiveStaffTenant(tenant: StaffTenant | null): void {
  active = tenant
  listeners.forEach((listener) => listener())
}

/*
 * Persistencia por pestaña (sessionStorage) del UUID de la empresa elegida, ligada al usuario autenticado.
 * El UUID no es permiso: al restaurarlo, la empresa debe seguir figurando en GET /staff/tenants (el servidor decide).
 * Nunca se guardan contraseñas, tokens ni cabeceras de autorización.
 */
const PERSIST_PREFIX = 'logixtic:staff-tenant:'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** Guarda (o borra, con null) el UUID de la empresa elegida para este usuario. */
export function persistStaffTenant(userId: string, tenantId: string | null): void {
  try {
    const s = storage()
    if (!s) return
    if (tenantId) s.setItem(PERSIST_PREFIX + userId, tenantId)
    else s.removeItem(PERSIST_PREFIX + userId)
  } catch {
    /* almacenamiento bloqueado: la empresa solo dura en memoria */
  }
}

/** UUID guardado para este usuario, o null. Debe revalidarse con el servidor antes de usarse. */
export function readPersistedStaffTenantId(userId: string): string | null {
  try {
    return storage()?.getItem(PERSIST_PREFIX + userId) ?? null
  } catch {
    return null
  }
}

/** Borra cualquier empresa persistida (cierre de sesión, cambio de usuario o salida explícita). */
export function clearPersistedStaffTenant(): void {
  try {
    const s = storage()
    if (!s) return
    const keys: string[] = []
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i)
      if (k?.startsWith(PERSIST_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => s.removeItem(k))
  } catch {
    /* sin efecto si el almacenamiento no está disponible */
  }
}
