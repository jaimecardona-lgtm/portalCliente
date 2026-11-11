import { describe, it, expect } from 'vitest'
import { authenticateDemo } from './local-auth'
import { readStoredSession, writeStoredSession, SESSION_STORAGE_KEY } from './session-storage'
import { createMockRepository } from '@/services/repositories/mock-repository'
import { DEMO_PASSWORD } from '@/data/fixtures/demo-data'

const repo = () => createMockRepository({ latencyMs: 0 })

describe('autenticación de presentación local', () => {
  it('acepta cuenta sintética con la contraseña de presentación', async () => {
    const result = await authenticateDemo(repo(), 'ana.torres@textilesandinos.example', DEMO_PASSWORD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.tenantId).toBe('tn-andino')
      expect(result.session.simulated).toBe(false)
    }
  })

  it('rechaza contraseñas arbitrarias aunque el correo exista', async () => {
    const result = await authenticateDemo(repo(), 'ana.torres@textilesandinos.example', 'cualquiera')
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
    const result = await authenticateDemo(repo(), 'CARLA.NINO@agroexport-pacifico.example', DEMO_PASSWORD)
    expect(result.ok && result.session.tenantId).toBe('tn-pacifico')
  })
})

describe('almacenamiento de sesión tolerante a fallos', () => {
  it('guarda y lee la sesión', () => {
    writeStoredSession({ userId: 'us-ana', tenantId: 'tn-andino', simulated: false })
    expect(readStoredSession()).toEqual({ userId: 'us-ana', tenantId: 'tn-andino', simulated: false })
  })

  it('ignora contenido corrupto', () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, '{not json')
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
