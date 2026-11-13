/**
 * Acceso a Supabase desde la interfaz: servicio de sesión y repositorio HTTP que usa el token vigente.
 *
 * Responsabilidad: crear una sola vez el cliente de Supabase (PKCE, renovación automática) y el repositorio
 * que envía el token a FastAPI. Devuelve null si la configuración pública no es válida: en ese caso la
 * aplicación no concede acceso ni usa datos de ejemplo.
 * Dependencias: supabase-client (carga diferida del SDK), supabase-session, api/http-portal-repository.
 * Restricciones: el token nunca se guarda en este módulo; lo gestiona el SDK. No hay sesión simulada.
 */
import { createContext } from 'react'
import { createHttpPortalRepository, type HttpPortalRepository } from '@/services/api/http-portal-repository'
import { createDocumentsApi, type DocumentsApi } from '@/services/api/documents-api'
import { createStaffApi, type StaffApi } from '@/services/api/staff-api'
import { createBrowserAuth } from './supabase-client'
import { createSupabaseSessionService, type SupabaseSessionService } from './supabase-session'

export interface SupabasePortal {
  /** Inicio y cierre de sesión, recuperación de contraseña y token vigente. */
  auth: SupabaseSessionService
  /** Repositorio de la API que envía el token de Supabase en cada petición. */
  repo: HttpPortalRepository
  /** Documentos de cliente final (subida, lectura, enlaces firmados, reemplazo y retirada). */
  documents: DocumentsApi
  /** Personal interno: rol, tenants asignados y verificados, y contexto de trabajo. */
  staff: StaffApi
}

let portalPromise: Promise<SupabasePortal | null> | null = null

async function createPortal(): Promise<SupabasePortal | null> {
  try {
    const client = await createBrowserAuth({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    })
    if (!client) return null
    const auth = createSupabaseSessionService(client)
    const repo = createHttpPortalRepository({
      baseUrl: String(import.meta.env.VITE_API_BASE_URL ?? ''),
      getToken: () => auth.accessToken(),
    })
    const documents = createDocumentsApi({
      baseUrl: String(import.meta.env.VITE_API_BASE_URL ?? ''),
      getToken: () => auth.accessToken(),
    })
    const staff = createStaffApi({
      baseUrl: String(import.meta.env.VITE_API_BASE_URL ?? ''),
      getToken: () => auth.accessToken(),
    })
    return { auth, repo, documents, staff }
  } catch {
    // Configuración insegura o URL de API no válida: sin portal, sin acceso.
    return null
  }
}

/** Crea (una vez) el portal de Supabase. Resuelve null si no hay configuración válida. */
export function loadSupabasePortal(): Promise<SupabasePortal | null> {
  portalPromise ??= createPortal()
  return portalPromise
}

/** Portal disponible para los componentes. Null fuera del modo Supabase o sin configuración válida. */
export const SupabasePortalContext = createContext<SupabasePortal | null>(null)
