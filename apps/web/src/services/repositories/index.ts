import { createContext, useContext } from 'react'
import { createMockRepository } from './mock-repository'
import type { PortalRepository } from './portal-repository'

export type DataMode = 'demo' | 'api'

/**
 * Selecciona la fuente de datos.
 * - 'demo': fixtures sintéticos en memoria.
 * - 'api':  reservado para FastAPI. Aún no implementado; falla explícitamente
 *           para evitar que se muestren datos falsos creyendo que son reales.
 */
export function createRepository(mode: DataMode = 'demo'): PortalRepository {
  if (mode === 'api') {
    throw new Error('El modo API aún no está implementado. Use el modo DEMO.')
  }
  return createMockRepository()
}

export const RepositoryContext = createContext<PortalRepository | null>(null)

export function useRepository(): PortalRepository {
  const repo = useContext(RepositoryContext)
  if (!repo) throw new Error('useRepository debe usarse dentro de RepositoryProvider')
  return repo
}

export type { PortalRepository } from './portal-repository'
