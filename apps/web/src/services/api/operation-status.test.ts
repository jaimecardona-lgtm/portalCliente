import { describe, expect, it } from 'vitest'
import { normalizeOperationStatus, operationStatusKey } from './operation-status'

describe('normalizeOperationStatus: los cinco estados reales de PostgreSQL', () => {
  it.each([
    ['Abierto', 'Abierto'],
    ['En tránsito', 'En tránsito'],
    ['Finalizado', 'Finalizado'],
    ['En proceso de facturación', 'En proceso de facturación'],
    ['Cerrado / Liquidado', 'Cerrado / Liquidado'],
  ])('%s se muestra como %s, sin estado de conversión', (raw, visible) => {
    expect(normalizeOperationStatus(raw)).toEqual({ status: visible, statusRaw: null })
  })

  it('no convierte Finalizado en Entregado ni En proceso de facturación en Pendiente cliente', () => {
    expect(normalizeOperationStatus('Finalizado').status).not.toBe('Entregado')
    expect(normalizeOperationStatus('En proceso de facturación').status).not.toBe('Pendiente cliente')
    expect(normalizeOperationStatus('Abierto').status).not.toBe('En puerto')
    expect(normalizeOperationStatus('Abierto').status).not.toBe('En aduana')
  })

  it('tolera diferencias técnicas: espacios, mayúsculas, acentos y separador «/»', () => {
    expect(normalizeOperationStatus('  en  transito ').status).toBe('En tránsito')
    expect(normalizeOperationStatus('EN PROCESO DE FACTURACION').status).toBe('En proceso de facturación')
    expect(normalizeOperationStatus('Cerrado/Liquidado').status).toBe('Cerrado / Liquidado')
  })
})

describe('normalizeOperationStatus: valores desconocidos', () => {
  it('conserva el texto original y lo marca como no reconocido, sin ocultar la operación', () => {
    expect(normalizeOperationStatus('Retenido en puerto')).toEqual({
      status: 'Estado no reconocido',
      statusRaw: 'Retenido en puerto',
    })
  })

  it('sin valor o con tipo no textual queda como no reconocido sin texto inventado', () => {
    expect(normalizeOperationStatus(null)).toEqual({ status: 'Estado no reconocido', statusRaw: null })
    expect(normalizeOperationStatus(undefined)).toEqual({ status: 'Estado no reconocido', statusRaw: null })
  })
})

describe('operationStatusKey', () => {
  it('quita acentos y normaliza separadores', () => {
    expect(operationStatusKey('En proceso de facturación')).toBe('en proceso de facturacion')
  })
})
