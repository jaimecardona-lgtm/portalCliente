import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
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
import { createLocalReviewerMiddleware, isLoopbackRequest } from './local-reviewer-middleware.mjs'

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

describe('middleware de desarrollo', () => {
  it('rechaza peticiones que no vienen de localhost', async () => {
    const mw = createLocalReviewerMiddleware({ configPath: '/no/existe.json' })
    const res = await call(mw, { ip: '192.168.1.20', host: '192.168.1.20:5173', method: 'GET', url: '/reviewer' })
    expect(res.statusCode).toBe(403)
    expect(isLoopbackRequest(fakeRequest({ host: 'evil.example:5173' }))).toBe(false)
    expect(isLoopbackRequest(fakeRequest({ host: 'localhost:5173' }))).toBe(true)
  })

  it('responde not_configured cuando no existe la configuración', async () => {
    const mw = createLocalReviewerMiddleware({ configPath: '/no/existe.json' })
    const res = await call(mw, { method: 'POST', body: { email: 'x@y.z', password: 'x' } })
    expect(res.statusCode).toBe(404)
    expect(res.json().status).toBe('not_configured')
  })

  it('acepta credenciales correctas y devuelve solo el perfil', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reviewer-'))
    const file = join(dir, 'cfg.json')
    writeFileSync(file, JSON.stringify(makeConfig()))
    const mw = createLocalReviewerMiddleware({ configPath: file })
    const res = await call(mw, { method: 'POST', body: { email: 'REVISOR@ejemplo.test', password: TEST_PASSWORD } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ok')
    expect(JSON.stringify(res.json())).not.toContain('credential')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rechaza contraseñas incorrectas y bloquea tras 5 intentos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reviewer-'))
    const file = join(dir, 'cfg.json')
    writeFileSync(file, JSON.stringify(makeConfig()))
    let now = 1_000_000
    const mw = createLocalReviewerMiddleware({ configPath: file, clock: () => now })
    for (let i = 0; i < 5; i++) {
      const res = await call(mw, { method: 'POST', body: { email: 'revisor@ejemplo.test', password: 'incorrecta-123456' } })
      expect(res.statusCode).toBe(401)
    }
    const locked = await call(mw, { method: 'POST', body: { email: 'revisor@ejemplo.test', password: TEST_PASSWORD } })
    expect(locked.statusCode).toBe(429)
    now += 61_000
    const after = await call(mw, { method: 'POST', body: { email: 'revisor@ejemplo.test', password: TEST_PASSWORD } })
    expect(after.statusCode).toBe(200)
    rmSync(dir, { recursive: true, force: true })
  })

  it('indica not_reviewer para otros correos sin revelar nada más', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reviewer-'))
    const file = join(dir, 'cfg.json')
    writeFileSync(file, JSON.stringify(makeConfig()))
    const mw = createLocalReviewerMiddleware({ configPath: file })
    const res = await call(mw, { method: 'POST', body: { email: 'otro@ejemplo.test', password: TEST_PASSWORD } })
    expect(res.json().status).toBe('not_reviewer')
    rmSync(dir, { recursive: true, force: true })
  })
})
