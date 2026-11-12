import { describe, it, expect } from 'vitest'
import { isAllowedProductionApiUrl } from './production-api-url.mjs'

describe('isAllowedProductionApiUrl', () => {
  it('acepta https absoluta', () => {
    expect(isAllowedProductionApiUrl('https://api.portal.example.test')).toBe(true)
    expect(isAllowedProductionApiUrl('https://api.portal.example.test/api/v1')).toBe(true)
  })

  it('acepta la ruta relativa del mismo origen', () => {
    expect(isAllowedProductionApiUrl('/api/v1')).toBe(true)
  })

  it('rechaza http, protocolo relativo y otros orígenes disfrazados', () => {
    expect(isAllowedProductionApiUrl('http://api.portal.example.test')).toBe(false)
    expect(isAllowedProductionApiUrl('//otro.example.test/api/v1')).toBe(false)
    expect(isAllowedProductionApiUrl('/api//evil.test')).toBe(false)
  })

  it('rechaza credenciales embebidas y valores vacíos', () => {
    expect(isAllowedProductionApiUrl('https://usuario:clave@api.portal.example.test')).toBe(false)
    expect(isAllowedProductionApiUrl('')).toBe(false)
    expect(isAllowedProductionApiUrl(undefined)).toBe(false)
  })

  it('rechaza rutas fuera de /api/', () => {
    expect(isAllowedProductionApiUrl('/')).toBe(false)
    expect(isAllowedProductionApiUrl('/login')).toBe(false)
  })
})
