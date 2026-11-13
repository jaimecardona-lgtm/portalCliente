import { describe, expect, it } from 'vitest'
import type { OperationStatus } from '@/types/domain'
import { operationAggregates as operationKpis } from './aggregates'

/** Distribución real de cada empresa QA: 4 por estado (20 operaciones). */
const distribution: OperationStatus[] = [
  ...Array(4).fill('Abierto'),
  ...Array(4).fill('En tránsito'),
  ...Array(4).fill('Finalizado'),
  ...Array(4).fill('En proceso de facturación'),
  ...Array(4).fill('Cerrado / Liquidado'),
]

const tenant = (pending: (boolean | null)[]) =>
  distribution.map((status, i) => ({ status, pendingClientResponse: pending[i] ?? null }))

describe('operationKpis con la distribución QA de 20 operaciones', () => {
  it('total 20, en operación 8, y 4 por cada uno de los demás estados', () => {
    const k = operationKpis(tenant([]))
    expect(k).toMatchObject({ total: 20, active: 8, inMotion: 4, finalized: 4, billing: 4, closed: 4 })
  })

  it('«Requieren respuesta» sin información cuando todos los valores son NULL (no se deduce del estado)', () => {
    const k = operationKpis(tenant([]))
    expect(k.responseKnown).toBe(false)
    expect(k.pending).toBe(0)
  })

  it('cuenta solo los TRUE persistidos cuando hay información', () => {
    const k = operationKpis(tenant([true, false, true]))
    expect(k.responseKnown).toBe(true)
    expect(k.pending).toBe(2)
  })

  it('sin operaciones todo queda en cero', () => {
    expect(operationKpis([])).toMatchObject({ total: 0, active: 0, responseKnown: false, pending: 0 })
  })
})
