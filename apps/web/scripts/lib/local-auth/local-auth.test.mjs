import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore } from './store.mjs'
import { createAuthService, RESET_TTL_MS } from './service.mjs'
import { createLocalAuthMiddleware, isAllowedOrigin, isLoopbackRequest, parseCookies, SESSION_COOKIE } from './http.mjs'
import { hashPassword } from '../reviewer-credentials.mjs'

const LEGAL = '2026.11-borrador-1'
const PASSWORD = 'clave-de-prueba-123'
const NEW_PASSWORD = 'nueva-clave-456789'

let dir
let now
let store
let service
const clock = () => now

function setup() {
  dir = mkdtempSync(join(tmpdir(), 'local-auth-'))
  now = 1_800_000_000_000
  store = createStore({ dir, legacyReviewerConfigPath: join(dir, 'none.json'), tenantId: 'tn-andino', clock })
  service = createAuthService({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
}

beforeEach(setup)
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function registration(email = 'ana@pruebas.example', extra = {}) {
  return { fullName: 'Ana Prueba', email, password: PASSWORD, acceptTerms: true, termsVersion: LEGAL, ...extra }
}

describe('registro', () => {
  it('crea la cuenta en el tenant del servidor, con rol cliente y sin contraseña en claro', async () => {
    const out = await service.register({ ...registration(), tenantId: 'tn-pacifico', role: 'Administrador' })
    expect(out.status).toBe('ok')
    expect(out.user.tenantId).toBe('tn-andino')
    expect(out.user.role).toBe('client')
    expect(out.user).not.toHaveProperty('passwordHash')
    const raw = readFileSync(join(dir, 'users.json'), 'utf8')
    expect(raw).not.toContain(PASSWORD)
    expect(raw).toContain('passwordHash')
  })

  it('normaliza el correo y rechaza duplicados', async () => {
    await service.register(registration('  ANA@Pruebas.Example '))
    const dup = await service.register(registration('ana@pruebas.example'))
    expect(dup.status).toBe('email_taken')
    expect(store.findUserByEmail('ana@pruebas.example')).not.toBeNull()
  })

  it('exige aceptar la versión vigente de los términos', async () => {
    expect((await service.register(registration('a@pruebas.example', { acceptTerms: false }))).field).toBe('terms')
    expect((await service.register(registration('b@pruebas.example', { termsVersion: 'vieja' }))).field).toBe('terms')
    const ok = await service.register(registration('c@pruebas.example'))
    expect(ok.user.termsVersionAccepted).toBe(LEGAL)
    expect(ok.user.termsAcceptedAt).toBeTruthy()
  })

  it('valida nombre, correo y longitud mínima de contraseña (8)', async () => {
    expect((await service.register(registration('d@pruebas.example', { fullName: 'A' }))).field).toBe('fullName')
    expect((await service.register(registration('no-es-correo'))).field).toBe('email')
    expect((await service.register(registration('e@pruebas.example', { password: 'corta' }))).field).toBe('password')
    expect((await service.register(registration('f@pruebas.example', { password: '12345678' }))).status).toBe('ok')
  })

  it('persiste entre instancias del almacén (reinicio del servidor)', async () => {
    await service.register(registration('persist@pruebas.example'))
    const second = createStore({ dir, legacyReviewerConfigPath: join(dir, 'none.json'), tenantId: 'tn-andino', clock })
    expect(second.findUserByEmail('persist@pruebas.example')).not.toBeNull()
  })

  it('no pierde registros con escrituras simultáneas y no deja archivos temporales', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => service.register(registration(`lote${i}@pruebas.example`))))
    expect(results.every((r) => r.status === 'ok')).toBe(true)
    const count = JSON.parse(readFileSync(join(dir, 'users.json'), 'utf8')).items.length
    expect(count).toBe(25)
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe('inicio de sesión y sesiones', () => {
  beforeEach(async () => {
    await service.register(registration('login@pruebas.example'))
  })

  it('acepta credenciales correctas y rechaza incorrectas con mensaje genérico', async () => {
    expect((await service.login({ email: 'login@pruebas.example', password: PASSWORD })).status).toBe('ok')
    expect((await service.login({ email: 'login@pruebas.example', password: 'incorrecta-999' })).status).toBe('invalid')
    expect((await service.login({ email: 'nadie@pruebas.example', password: PASSWORD })).status).toBe('invalid')
  })

  it('bloquea tras 5 intentos fallidos y se desbloquea al pasar el plazo', async () => {
    for (let i = 0; i < 5; i++) await service.login({ email: 'login@pruebas.example', password: 'mala-clave-000' })
    expect((await service.login({ email: 'login@pruebas.example', password: PASSWORD })).status).toBe('locked')
    now += 61_000
    expect((await service.login({ email: 'login@pruebas.example', password: PASSWORD })).status).toBe('ok')
  })

  it('la sesión la valida el servidor y dura 12 h, o 14 días si se recuerda', async () => {
    const short = await service.login({ email: 'login@pruebas.example', password: PASSWORD, remember: false })
    expect(short.maxAge).toBe(12 * 3600)
    expect(service.me(short.token)?.email).toBe('login@pruebas.example')
    now += 13 * 3600 * 1000
    expect(service.me(short.token)).toBeNull()
    const long = await service.login({ email: 'login@pruebas.example', password: PASSWORD, remember: true })
    expect(long.maxAge).toBe(14 * 24 * 3600)
    now += 13 * 3600 * 1000
    expect(service.me(long.token)).not.toBeNull()
  })

  it('guarda solo el hash del token de sesión, no el token', async () => {
    const { token } = await service.login({ email: 'login@pruebas.example', password: PASSWORD })
    expect(readFileSync(join(dir, 'sessions.json'), 'utf8')).not.toContain(token)
  })

  it('cerrar sesión invalida el token', async () => {
    const { token } = await service.login({ email: 'login@pruebas.example', password: PASSWORD })
    await service.logout(token)
    expect(service.me(token)).toBeNull()
  })
})

describe('recuperación de contraseña', () => {
  beforeEach(async () => {
    await service.register(registration('reset@pruebas.example'))
  })

  it('la respuesta pública es siempre genérica, exista o no la cuenta', async () => {
    expect(await service.forgotPassword('reset@pruebas.example')).toEqual({ status: 'accepted' })
    expect(await service.forgotPassword('nadie@pruebas.example')).toEqual({ status: 'accepted' })
  })

  it('un enlace de un solo uso restablece la contraseña e invalida sesiones', async () => {
    const { token: oldSession } = await service.login({ email: 'reset@pruebas.example', password: PASSWORD })
    await service.forgotPassword('reset@pruebas.example')
    const [item] = store.listOutbox()
    expect(item.email).toBe('reset@pruebas.example')
    expect(readFileSync(join(dir, 'reset-tokens.json'), 'utf8')).not.toContain(item.token)

    expect((await service.resetPassword({ token: item.token, password: NEW_PASSWORD })).status).toBe('ok')
    expect(service.me(oldSession)).toBeNull()
    expect((await service.login({ email: 'reset@pruebas.example', password: PASSWORD })).status).toBe('invalid')
    expect((await service.login({ email: 'reset@pruebas.example', password: NEW_PASSWORD })).status).toBe('ok')
    expect((await service.resetPassword({ token: item.token, password: 'otra-clave-999999' })).status).toBe('invalid_token')
    expect(store.listOutbox()).toEqual([])
  })

  it('un enlace caducado (15 min) no sirve', async () => {
    await service.forgotPassword('reset@pruebas.example')
    const [item] = store.listOutbox()
    now += RESET_TTL_MS + 1000
    expect((await service.resetPassword({ token: item.token, password: NEW_PASSWORD })).status).toBe('invalid_token')
  })

  it('valida la nueva contraseña antes de consumir el enlace', async () => {
    await service.forgotPassword('reset@pruebas.example')
    const [item] = store.listOutbox()
    expect((await service.resetPassword({ token: item.token, password: 'corta' })).field).toBe('password')
    expect((await service.resetPassword({ token: item.token, password: NEW_PASSWORD })).status).toBe('ok')
  })
})

describe('perfil y cambio de contraseña', () => {
  it('edita solo el nombre; el tenant y el rol no cambian', async () => {
    const { token } = await service.register(registration('perfil@pruebas.example'))
    const out = await service.updateProfile(token, { fullName: 'Ana Nueva', tenantId: 'tn-pacifico', role: 'Administrador' })
    expect(out.status).toBe('ok')
    expect(out.user.fullName).toBe('Ana Nueva')
    expect(out.user.tenantId).toBe('tn-andino')
    expect(out.user.role).toBe('client')
  })

  it('cambiar contraseña exige la actual y cierra las demás sesiones', async () => {
    const first = await service.register(registration('cambio@pruebas.example'))
    const second = await service.login({ email: 'cambio@pruebas.example', password: PASSWORD })
    expect((await service.changePassword(first.token, { currentPassword: 'incorrecta-999', newPassword: NEW_PASSWORD })).status).toBe('wrong_password')
    expect((await service.changePassword(first.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe('ok')
    expect(service.me(second.token)).toBeNull()
    expect(service.me(first.token)).not.toBeNull()
  })

  it('sin sesión no se puede editar nada', async () => {
    expect((await service.updateProfile('token-falso', { fullName: 'X Y' })).status).toBe('unauthorized')
  })
})

describe('reglas de transporte', () => {
  it('solo admite loopback y orígenes locales', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:5173' } })).toBe(true)
    expect(isLoopbackRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: { host: '127.0.0.1:5173' } })).toBe(false)
    expect(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'evil.example' } })).toBe(false)
    expect(isAllowedOrigin({ headers: { origin: 'http://localhost:5173' } })).toBe(true)
    expect(isAllowedOrigin({ headers: { origin: 'https://evil.example' } })).toBe(false)
    expect(isAllowedOrigin({ headers: {} })).toBe(true)
  })

  it('lee cookies de sesión', () => {
    expect(parseCookies(`a=1; ${SESSION_COOKIE}=abc%20def`)[SESSION_COOKIE]).toBe('abc def')
  })
})

describe('middleware HTTP', () => {
  function fakeReq({ method = 'GET', url = '/', body, headers = {}, ip = '127.0.0.1' } = {}) {
    const req = body === undefined ? Readable.from([]) : Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
    req.method = method
    req.url = url
    req.headers = { host: '127.0.0.1:5173', ...headers }
    if (body !== undefined && !headers['content-type']) req.headers['content-type'] = 'application/json'
    req.socket = { remoteAddress: ip }
    return req
  }
  function fakeRes() {
    return {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v
      },
      end(c) {
        this.body = c ?? ''
      },
      json() {
        return JSON.parse(this.body)
      },
    }
  }
  async function call(mw, opts) {
    const res = fakeRes()
    await mw(fakeReq(opts), res)
    // Esperamos a que el manejador asíncrono termine.
    await new Promise((r) => setTimeout(r, 20))
    return res
  }

  it('rechaza peticiones remotas', async () => {
    const mw = createLocalAuthMiddleware({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    const res = await call(mw, { method: 'GET', url: '/me', ip: '192.168.0.9' })
    expect(res.statusCode).toBe(403)
  })

  it('registra, expone la sesión por cookie HttpOnly y nunca devuelve passwordHash', async () => {
    const mw = createLocalAuthMiddleware({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    const reg = await call(mw, { method: 'POST', url: '/register', body: registration('http@pruebas.example') })
    expect(reg.statusCode).toBe(201)
    const cookie = String(reg.headers['set-cookie'])
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(reg.body).not.toContain('passwordHash')
    const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    const me = await call(mw, { method: 'GET', url: '/me', headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } })
    expect(me.statusCode).toBe(200)
    expect(me.body).not.toContain('passwordHash')
  })

  it('limita el tamaño del cuerpo y exige JSON', async () => {
    const mw = createLocalAuthMiddleware({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    const big = await call(mw, { method: 'POST', url: '/login', body: { email: 'x', password: 'y'.repeat(20000) } })
    expect([400, 413]).toContain(big.statusCode)
    const text = await call(mw, { method: 'POST', url: '/login', headers: { 'content-type': 'text/plain' }, body: 'hola' })
    expect(text.statusCode).toBe(415)
  })

  it('rechaza orígenes que no son localhost', async () => {
    const mw = createLocalAuthMiddleware({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    const res = await call(mw, { method: 'POST', url: '/login', headers: { origin: 'https://evil.example' }, body: { email: 'a', password: 'b' } })
    expect(res.statusCode).toBe(403)
  })

  it('la bandeja local de recuperación solo responde a localhost', async () => {
    const mw = createLocalAuthMiddleware({ store, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    const remote = await call(mw, { method: 'GET', url: '/outbox', ip: '10.1.1.1' })
    expect(remote.statusCode).toBe(403)
    const local = await call(mw, { method: 'GET', url: '/outbox' })
    expect(local.statusCode).toBe(200)
    expect(local.headers['content-type']).toContain('text/html')
  })
})

describe('migración de la configuración anterior de revisión', () => {
  it('importa el usuario existente sin borrar nada', async () => {
    const legacy = join(dir, 'reviewer.config.json')
    writeFileSync(
      legacy,
      JSON.stringify({ user: { id: 'us-reviewer', tenantId: 'tn-andino', fullName: 'Revisor', email: 'rev@pruebas.example', role: 'Operativo' }, credential: hashPassword(PASSWORD) }),
    )
    const migrated = createStore({ dir, legacyReviewerConfigPath: legacy, tenantId: 'tn-andino', clock })
    const { readReviewerConfig } = await import('../reviewer-credentials.mjs')
    await migrated.init(() => readReviewerConfig(legacy))
    expect(migrated.findUserByEmail('rev@pruebas.example')?.fullName).toBe('Revisor')
    expect(existsSync(legacy)).toBe(true)
    const svc = createAuthService({ store: migrated, tenantId: 'tn-andino', legalVersion: LEGAL, clock })
    expect((await svc.login({ email: 'rev@pruebas.example', password: PASSWORD })).status).toBe('ok')
  })
})
