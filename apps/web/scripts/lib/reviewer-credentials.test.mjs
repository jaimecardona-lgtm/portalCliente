import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  readReviewerConfig,
  publicReviewerProfile,
  MIN_PASSWORD_LENGTH,
} from './reviewer-credentials.mjs'

// Contraseñas solo de prueba, generadas aquí. No son credenciales de ningún usuario.
const TEST_PASSWORD = 'prueba-unitaria-123'

function makeConfig(password = TEST_PASSWORD) {
  return {
    version: 1,
    user: { id: 'us-reviewer', tenantId: 'tn-andino', fullName: 'Revisor de prueba', email: 'revisor@ejemplo.test', role: 'Operativo' },
    credential: hashPassword(password),
  }
}

function fakeRequest({ method = 'POST', url = '/login', body, ip = '127.0.0.1', host = '127.0.0.1:5173' } = {}) {
  const req = body === undefined ? Readable.from([]) : Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host }
  req.socket = { remoteAddress: ip }
  return req
}

function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    end(chunk) {
      this.body = chunk
    },
    json() {
      return JSON.parse(this.body)
    },
  }
}

async function call(middleware, opts) {
  const res = fakeResponse()
  await middleware(fakeRequest(opts), res)
  return res
}

describe('hash de contraseña', () => {
  it('verifica la contraseña correcta', () => {
    const record = hashPassword(TEST_PASSWORD)
    expect(verifyPassword(TEST_PASSWORD, record)).toBe(true)
  })

  it('rechaza una contraseña incorrecta y entradas no válidas', () => {
    const record = hashPassword(TEST_PASSWORD)
    expect(verifyPassword('otra-contraseña-123', record)).toBe(false)
    expect(verifyPassword(undefined, record)).toBe(false)
    expect(verifyPassword(TEST_PASSWORD, null)).toBe(false)
    expect(verifyPassword(TEST_PASSWORD, { ...record, algorithm: 'md5' })).toBe(false)
    expect(verifyPassword(TEST_PASSWORD, { ...record, hash: 'zz' })).toBe(false)
  })

  it('usa sal distinta en cada registro y nunca guarda la contraseña en claro', () => {
    const a = hashPassword(TEST_PASSWORD)
    const b = hashPassword(TEST_PASSWORD)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(JSON.stringify(a)).not.toContain(TEST_PASSWORD)
  })
})

describe('reglas de contraseña', () => {
  it('exige longitud mínima y que no coincida con el correo', () => {
    expect(validatePassword('corta')).toMatch(/al menos/)
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
    expect(validatePassword('revisor@ejemplo.test', 'revisor@ejemplo.test')).toMatch(/igual al correo/)
  })
})

describe('configuración local', () => {
  it('devuelve null si el archivo no existe o está incompleto', () => {
    expect(readReviewerConfig('/ruta/que/no/existe.json')).toBeNull()
    const dir = mkdtempSync(join(tmpdir(), 'reviewer-'))
    const file = join(dir, 'cfg.json')
    writeFileSync(file, JSON.stringify({ user: {} }))
    expect(readReviewerConfig(file)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('el perfil público no incluye la credencial', () => {
    const profile = publicReviewerProfile(makeConfig())
    expect(profile).not.toHaveProperty('credential')
    expect(profile.tenantId).toBe('tn-andino')
  })
})
