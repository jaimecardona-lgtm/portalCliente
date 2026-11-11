import { describe, it, expect } from 'vitest'
import { authenticateDemo, readStoredSession, writeStoredSession } from './demo-auth'
import { createMockRepository } from '@/services/repositories/mock-repository'
import { DEMO_PASSWORD } from '@/data/fixtures/demo-data'

const repo = () => createMockRepository({ latencyMs: 0 })

describe('autenticación DEMO', () => {
  it('acepta cuenta sintética con la contraseña DEMO', async () => {
    const result = await authenticateDemo(repo(), 'ana.torres@andino.demo.test', DEMO_PASSWORD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.tenantId).toBe('tn-andino')
      expect(result.session.simulated).toBe(false)
    }
  })

  it('rechaza contraseñas arbitrarias aunque el correo exista', async () => {
    const result = await authenticateDemo(repo(), 'ana.torres@andino.demo.test', 'cualquiera')
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' })
  })

  it('rechaza correos desconocidos', async () => {
    const result = await authenticateDemo(repo(), 'nadie@ejemplo.test', DEMO_PASSWORD)
    expect(result.ok).toBe(false)
  })

  it('rechaza campos vacíos', async () => {
    expect(await authenticateDemo(repo(), '  ', '')).toEqual({ ok: false, reason: 'empty_fields' })
  })

  it('normaliza mayúsculas en el correo', async () => {
    const result = await authenticateDemo(repo(), 'CARLA.NINO@pacifico.demo.test', DEMO_PASSWORD)
    expect(result.ok && result.session.tenantId).toBe('tn-pacifico')
  })
})

describe('almacenamiento de sesión tolerante a fallos', () => {
  it('guarda y lee la sesión', () => {
    writeStoredSession({ userId: 'us-ana', tenantId: 'tn-andino', simulated: false })
    expect(readStoredSession()).toEqual({ userId: 'us-ana', tenantId: 'tn-andino', simulated: false })
  })

  it('ignora contenido corrupto', () => {
    window.sessionStorage.setItem('logixtic.portal.demo-session', '{not json')
    expect(readStoredSession()).toBeNull()
  })

  it('no lanza si el almacenamiento está bloqueado', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    try {
      expect(readStoredSession()).toBeNull()
      expect(() => writeStoredSession(null)).not.toThrow()
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original)
    }
  })
})
