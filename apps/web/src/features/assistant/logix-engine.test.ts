import { describe, it, expect } from 'vitest'
import { answerLogixQuestion, type LogixData } from './logix-engine'
import { operations, documents, quotes } from '@/data/fixtures/demo-data'

const NOW = new Date('2026-11-11T09:00:00-05:00')
const andino = (): LogixData => ({
  operations: operations.filter((o) => o.tenantId === 'tn-andino'),
  documents: documents.filter((d) => d.tenantId === 'tn-andino').map((d) => ({ ...d, status: d.expiresAt < '2026-11-11' ? 'vencido' : d.status })),
  quotes: quotes.filter((q) => q.tenantId === 'tn-andino'),
})

describe('Logix DEMO', () => {
  it('responde con operaciones del tenant activo', () => {
    const answer = answerLogixQuestion('¿Qué pasa con DO-26-0398?', andino(), undefined, NOW)
    expect(answer.text).toContain('DO-26-0398')
    expect(answer.text).toContain('En aduana')
    expect(answer.operationIds).toEqual(['op-0398'])
  })

  it('no conoce operaciones de otra empresa y lo indica', () => {
    const answer = answerLogixQuestion('¿Qué pasa con DO-26-0408?', andino(), undefined, NOW)
    expect(answer.unavailable).toBe(true)
    expect(answer.text).toMatch(/no encontré/i)
  })

  it('pregunta fuera de alcance devuelve no disponible', () => {
    const answer = answerLogixQuestion('¿Cuál es el clima en Shanghái mañana?', andino(), undefined, NOW)
    expect(answer.unavailable).toBe(true)
  })

  it('lista operaciones que esperan respuesta', () => {
    const answer = answerLogixQuestion('¿Qué operaciones esperan mi respuesta?', andino(), undefined, NOW)
    expect(answer.text).toContain('DO-26-0398')
  })

  it('usa la operación de contexto cuando se abre desde un DO', () => {
    const answer = answerLogixQuestion('¿Cuál es el estado?', andino(), 'op-0412', NOW)
    expect(answer.operationIds).toEqual(['op-0412'])
  })

  it('informa documentos vencidos', () => {
    const answer = answerLogixQuestion('¿Qué documentos están vencidos?', andino(), undefined, NOW)
    expect(answer.text).toMatch(/documento/i)
  })

  it('una pregunta vacía pide reformularla', () => {
    expect(answerLogixQuestion('   ', andino(), undefined, NOW).text).toMatch(/Escriba/)
  })
})
