import { describe, it, expect } from 'vitest'
import { bogotaDayUTC, daysUntil, formatDate, formatMoney } from './format'

describe('formatDate (fechas de solo día)', () => {
  it('muestra el mismo día que se guardó, sin desplazamiento de zona horaria', () => {
    expect(formatDate('2026-10-01')).toBe('01 de oct de 2026')
    expect(formatDate('2026-11-24')).toBe('24 de nov de 2026')
    expect(formatDate('2026-12-31')).toBe('31 de dic de 2026')
  })

  it('devuelve guion para valores vacíos o inválidos', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('no-es-fecha')).toBe('—')
  })
})

describe('daysUntil', () => {
  it('calcula días calendario desde el día de Bogotá', () => {
    // 2026-11-11 09:00 en Bogotá (UTC-5) = 14:00 UTC del mismo día.
    const now = new Date('2026-11-11T14:00:00Z')
    expect(daysUntil('2026-11-11', now)).toBe(0)
    expect(daysUntil('2026-11-24', now)).toBe(13)
    expect(daysUntil('2026-10-01', now)).toBeLessThan(0)
  })

  it('no cambia de día antes de medianoche en Bogotá aunque en UTC ya sea otro día', () => {
    // 2026-11-11 22:00 en Bogotá = 2026-11-12 03:00 UTC.
    const lateBogota = new Date('2026-11-12T03:00:00Z')
    expect(bogotaDayUTC(lateBogota).toISOString().slice(0, 10)).toBe('2026-11-11')
    expect(daysUntil('2026-11-11', lateBogota)).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formatea COP sin decimales', () => {
    expect(formatMoney(3850000, 'COP')).toMatch(/3\.850\.000/)
  })
})
