import { describe, it, expect } from 'vitest'
import { applyOperationFilters, countActiveFilters, DEFAULT_FILTERS, parseOperationSearch, toSearchParams, type OperationFilters } from './filters'
import { operations } from '@/data/fixtures/demo-data'

const andino = operations.filter((o) => o.tenantId === 'tn-andino')

const withFilters = (partial: Partial<OperationFilters>): OperationFilters => ({ ...DEFAULT_FILTERS, ...partial })

describe('filtros de operaciones', () => {
  it('filtra por estado y los resultados coinciden con el filtro', () => {
    const result = applyOperationFilters(andino, withFilters({ statuses: ['En aduana'] }))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((o) => o.status === 'En aduana')).toBe(true)
  })

  it('búsqueda por número DO ignora mayúsculas', () => {
    const result = applyOperationFilters(andino, withFilters({ q: 'do-26-0412' }))
    expect(result.map((o) => o.doNumber)).toEqual(['DO-26-0412'])
  })

  it('búsqueda también encuentra booking y puertos', () => {
    expect(applyOperationFilters(andino, withFilters({ q: 'BKG-88412' })).map((o) => o.doNumber)).toEqual(['DO-26-0412'])
    expect(applyOperationFilters(andino, withFilters({ q: 'rotterdam' })).length).toBeGreaterThan(0)
  })

  it('solo pendientes de respuesta del cliente', () => {
    const result = applyOperationFilters(andino, withFilters({ pendingOnly: true }))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((o) => o.pendingClientResponse)).toBe(true)
  })

  it('rango de fechas sobre ETD', () => {
    const result = applyOperationFilters(andino, withFilters({ from: '2026-11-01', to: '2026-12-31' }))
    expect(result.every((o) => (o.etd ?? o.createdAt) >= '2026-11-01')).toBe(true)
    expect(result.some((o) => o.doNumber === 'DO-26-0377')).toBe(false)
  })

  it('combinación de filtros es conjunción (AND)', () => {
    const result = applyOperationFilters(andino, withFilters({ kind: 'Importación', transport: 'Marítimo FCL' }))
    expect(result.every((o) => o.kind === 'Importación' && o.transport === 'Marítimo FCL')).toBe(true)
  })

  it('ordena por ETA ascendente con valores vacíos al final', () => {
    const sorted = applyOperationFilters(andino, withFilters({ sort: 'eta', dir: 'asc' }))
    const etas = sorted.map((o) => o.eta)
    const firstEmpty = etas.findIndex((e) => e === null)
    if (firstEmpty !== -1) expect(etas.slice(firstEmpty).every((e) => e === null)).toBe(true)
    const filled = etas.filter((e): e is string => e !== null)
    expect([...filled].sort()).toEqual(filled)
  })

  it('dirección descendente invierte el orden', () => {
    const asc = applyOperationFilters(andino, withFilters({ sort: 'doNumber', dir: 'asc' })).map((o) => o.doNumber)
    const desc = applyOperationFilters(andino, withFilters({ sort: 'doNumber', dir: 'desc' })).map((o) => o.doNumber)
    expect(desc).toEqual([...asc].reverse())
  })
})

describe('parseo y serialización de la URL', () => {
  it('ignora valores de estado inválidos y valores de orden desconocidos', () => {
    const parsed = parseOperationSearch({ status: 'En aduana,Inventado', sort: 'hack', dir: 'up', from: '31/12/2026' })
    expect(parsed.statuses).toEqual(['En aduana'])
    expect(parsed.sort).toBe(DEFAULT_FILTERS.sort)
    expect(parsed.dir).toBe('desc')
    expect(parsed.from).toBe('')
  })

  it('serializa y vuelve a leer los mismos filtros', () => {
    const original = withFilters({ q: 'DO-26', statuses: ['En tránsito', 'En puerto'], pendingOnly: true, sort: 'eta', dir: 'asc' })
    const params = toSearchParams(original)
    expect(parseOperationSearch(params)).toEqual(original)
  })

  it('no incluye en la URL los valores por defecto', () => {
    expect(toSearchParams(DEFAULT_FILTERS)).toEqual({})
  })

  it('cuenta filtros activos', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0)
    expect(countActiveFilters(withFilters({ q: 'x', pendingOnly: true }))).toBe(2)
  })
})
