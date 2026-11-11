import { describe, it, expect } from 'vitest'
import { readStoredSession, writeStoredSession, SESSION_STORAGE_KEY } from './session-storage'

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
