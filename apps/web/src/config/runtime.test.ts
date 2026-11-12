import { describe, it, expect } from 'vitest'
import { buildFeatures, isSupabaseConfigured, resolveAccessState, IMPLEMENTED_AUTH_PROVIDERS } from './runtime'

const SUPABASE_OK = { isLocal: false, provider: 'supabase', apiBaseUrl: '/api/v1', supabaseConfigured: true }

describe('resolveAccessState (producción)', () => {
  it('bloquea sin proveedor configurado', () => {
    expect(resolveAccessState({ isLocal: false })).toEqual({ mode: 'blocked', reason: 'provider-missing' })
    expect(resolveAccessState({ isLocal: false, provider: '   ' })).toEqual({ mode: 'blocked', reason: 'provider-missing' })
  })

  it('bloquea con un proveedor desconocido, incluido el antiguo "oidc"', () => {
    expect(resolveAccessState({ isLocal: false, provider: 'demo', apiBaseUrl: '/api/v1' })).toEqual({
      mode: 'blocked',
      reason: 'provider-unknown',
    })
    expect(resolveAccessState({ ...SUPABASE_OK, provider: 'oidc' }).mode).toBe('blocked')
  })

  it('bloquea si falta la URL de la API', () => {
    expect(resolveAccessState({ isLocal: false, provider: 'supabase', supabaseConfigured: true })).toEqual({
      mode: 'blocked',
      reason: 'api-url-missing',
    })
  })

  it('bloquea con Supabase si falta la configuración pública', () => {
    expect(resolveAccessState({ ...SUPABASE_OK, supabaseConfigured: false })).toEqual({
      mode: 'blocked',
      reason: 'supabase-config-missing',
    })
  })

  it('aunque Supabase esté configurado, bloquea mientras no existan pantallas conectadas', () => {
    expect(IMPLEMENTED_AUTH_PROVIDERS).toHaveLength(0)
    expect(resolveAccessState(SUPABASE_OK)).toEqual({ mode: 'blocked', reason: 'provider-not-implemented' })
  })

  it('nunca concede acceso local fuera de desarrollo, con cualquier configuración', () => {
    for (const provider of [undefined, 'supabase', 'oidc', 'demo', 'local']) {
      expect(resolveAccessState({ isLocal: false, provider, apiBaseUrl: '/api/v1', supabaseConfigured: true }).mode).toBe(
        'blocked',
      )
    }
  })
})

describe('resolveAccessState (desarrollo)', () => {
  it('permite el acceso de presentación local sin configuración de Supabase', () => {
    expect(resolveAccessState({ isLocal: true })).toEqual({ mode: 'local' })
  })
})

describe('isSupabaseConfigured', () => {
  it('es falso sin variables y verdadero con una configuración válida', () => {
    expect(isSupabaseConfigured({})).toBe(false)
    expect(
      isSupabaseConfigured({
        VITE_SUPABASE_URL: 'https://proyecto-prueba.supabase.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_sintetica_123456',
      }),
    ).toBe(true)
  })

  it('nunca lanza: una clave secreta cuenta como no configurada', () => {
    expect(
      isSupabaseConfigured({
        VITE_SUPABASE_URL: 'https://proyecto-prueba.supabase.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sintetica',
      }),
    ).toBe(false)
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
