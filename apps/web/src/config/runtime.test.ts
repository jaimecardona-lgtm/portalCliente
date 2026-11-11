import { describe, it, expect } from 'vitest'
import { buildFeatures, resolveAccessState, IMPLEMENTED_AUTH_PROVIDERS } from './runtime'

describe('resolveAccessState (producción)', () => {
  it('bloquea sin proveedor configurado', () => {
    expect(resolveAccessState({ isLocal: false })).toEqual({ mode: 'blocked', reason: 'provider-missing' })
    expect(resolveAccessState({ isLocal: false, provider: '   ' })).toEqual({ mode: 'blocked', reason: 'provider-missing' })
  })

  it('bloquea con un proveedor desconocido', () => {
    expect(resolveAccessState({ isLocal: false, provider: 'demo', apiBaseUrl: 'https://x.invalid' })).toEqual({
      mode: 'blocked',
      reason: 'provider-unknown',
    })
  })

  it('bloquea si falta la URL de la API', () => {
    expect(resolveAccessState({ isLocal: false, provider: 'oidc' })).toEqual({ mode: 'blocked', reason: 'api-url-missing' })
  })

  it('bloquea aunque la configuración esté completa mientras no exista implementación del proveedor', () => {
    expect(IMPLEMENTED_AUTH_PROVIDERS).toHaveLength(0)
    expect(resolveAccessState({ isLocal: false, provider: 'oidc', apiBaseUrl: 'https://api.invalid' })).toEqual({
      mode: 'blocked',
      reason: 'provider-not-implemented',
    })
  })

  it('nunca concede acceso local fuera de desarrollo, con cualquier configuración', () => {
    for (const provider of [undefined, 'oidc', 'demo', 'local']) {
      expect(resolveAccessState({ isLocal: false, provider, apiBaseUrl: 'https://api.invalid' }).mode).toBe('blocked')
    }
  })
})

describe('resolveAccessState (desarrollo)', () => {
  it('permite el acceso de presentación local', () => {
    expect(resolveAccessState({ isLocal: true })).toEqual({ mode: 'local' })
  })
})

describe('funciones por entorno', () => {
  it('en producción todas las funciones sensibles o incompletas están desactivadas', () => {
    const prod = buildFeatures(false)
    expect(Object.values(prod).every((v) => v === false)).toBe(true)
  })

  it('en desarrollo las funciones de presentación local están activas', () => {
    const dev = buildFeatures(true)
    expect(dev.tenantSwitcher).toBe(true)
    expect(dev.quoteDecisions).toBe(true)
    expect(dev.assistant).toBe(true)
    // La recuperación de contraseña no está implementada en ningún entorno.
    expect(dev.passwordRecovery).toBe(false)
  })
})
