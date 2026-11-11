import { createContext, useContext } from 'react'
import type { PortalRepository } from './portal-repository'

export type { PortalRepository } from './portal-repository'

/**
 * Carga el repositorio de presentación local.
 *
 * La importación es dinámica y está protegida por `IS_LOCAL_PRESENTATION`: en el build de producción
 * esa rama se elimina y el módulo con fixtures no forma parte del bundle.
 *
 * Cuando exista FastAPI se añadirá `loadRemoteRepository()` con la misma interfaz.
 */
export async function loadLocalRepository(): Promise<PortalRepository> {
  // La condición usa import.meta.env.DEV directamente para que el compilador elimine esta rama en producción.
  if (!import.meta.env.DEV) {
    throw new Error('El repositorio local solo está disponible en desarrollo.')
  }
  const { createMockRepository } = await import('./mock-repository')
  return createMockRepository()
}

/** Repositorio disponible en la aplicación. Es null cuando no hay fuente de datos (producción sin backend). */
export const RepositoryContext = createContext<PortalRepository | null>(null)

/** Acceso al repositorio. Solo debe usarse en rutas que ya pasaron la guarda de acceso. */
export function useRepository(): PortalRepository {
  const repo = useContext(RepositoryContext)
  if (!repo) throw new Error('No hay fuente de datos disponible en este entorno.')
  return repo
}

/** Acceso opcional al repositorio (para componentes que deben funcionar sin datos). */
export function useOptionalRepository(): PortalRepository | null {
  return useContext(RepositoryContext)
}
