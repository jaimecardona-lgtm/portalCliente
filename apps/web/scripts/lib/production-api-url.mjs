/**
 * Validación de la URL de la API para el build de producción.
 *
 * Aceptada:
 * - https absoluta (API en otro servicio).
 * - Ruta del mismo origen que empieza por "/api/" (React y FastAPI comparten origen: sin CORS).
 *
 * Rechazada: http, "//host" (otro origen), credenciales embebidas, espacios y cualquier otra cadena.
 * Usado por vite.config.ts para bloquear builds de producción mal configurados.
 */
export function isAllowedProductionApiUrl(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (/^https:\/\/[^/\s@]+(\/[^\s]*)?$/.test(trimmed)) return true
  return trimmed.startsWith('/api/') && !trimmed.includes('//') && !/\s/.test(trimmed)
}
