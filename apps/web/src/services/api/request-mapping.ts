/**
 * Mapeo de solicitudes de personal interno (tabla `requests`) al dominio del portal.
 *
 * Reglas:
 * - Los valores vienen de los CHECK de PostgreSQL (migración 20261111000000_foundation.sql). Un valor fuera de
 *   esas tablas es un error de contrato explícito: nunca se sustituye por otro tipo o estado.
 * - La API de personal no expone el autor (created_by): `createdBy` queda en null, no se inventa.
 * - Sin adjuntos ni operación vinculada en esta fase: el endpoint de personal no los devuelve.
 */
import type { Request, RequestStatus, RequestType } from '@/types/domain'
import { PortalApiError } from './http-client'
import type { StaffRequest } from './staff-api'

const TYPE_FROM_DB: Record<string, RequestType> = {
  consulta: 'Consulta',
  modificacion_datos: 'Modificación de datos',
  documentacion: 'Documentación',
  cotizacion: 'Cotización',
  otro: 'Otro',
}

const STATUS_FROM_DB: Record<string, RequestStatus> = {
  recibida: 'Recibida',
  en_revision: 'En revisión',
  respondida: 'Respondida',
  cerrada: 'Cerrada',
}

/** Valor de base de datos para un tipo del dominio (inverso de TYPE_FROM_DB). */
export const REQUEST_TYPE_TO_DB: Record<RequestType, string> = {
  Consulta: 'consulta',
  'Modificación de datos': 'modificacion_datos',
  Documentación: 'documentacion',
  Cotización: 'cotizacion',
  Otro: 'otro',
}

function contractError(field: string, value: string): PortalApiError {
  return new PortalApiError('invalid_response', `Valor de solicitud no reconocido en ${field}: ${value}.`, 200)
}

export function requestFromStaff(row: StaffRequest): Request {
  const type = TYPE_FROM_DB[row.requestType]
  if (!type) throw contractError('request_type', row.requestType)
  const status = STATUS_FROM_DB[row.status]
  if (!status) throw contractError('status', row.status)
  return {
    id: row.id,
    tenantId: row.tenantId,
    number: row.number,
    type,
    subject: row.subject,
    description: row.description,
    operationId: row.operationId,
    status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachmentIds: [],
    createdBy: row.createdBy,
  }
}

/** Lista de solicitudes de personal, de la más reciente a la más antigua. Lista vacía si no hay registros. */
export function requestsFromStaff(rows: StaffRequest[]): Request[] {
  return rows.map(requestFromStaff).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
