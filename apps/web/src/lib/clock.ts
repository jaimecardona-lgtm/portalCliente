import { IS_LOCAL_PRESENTATION } from '@/config/runtime'

/** Fecha de referencia de los datos sintéticos locales. Solo se usa en desarrollo. */
export const LOCAL_REFERENCE_ISO = '2026-11-11T09:00:00-05:00'

/**
 * Instante "actual" de la aplicación.
 * En presentación local usa la fecha de referencia de los datos sintéticos (resultados reproducibles).
 * En producción usa el reloj real.
 */
export function referenceNow(): Date {
  return IS_LOCAL_PRESENTATION ? new Date(LOCAL_REFERENCE_ISO) : new Date()
}
