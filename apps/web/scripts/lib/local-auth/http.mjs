// Capa HTTP del acceso local de desarrollo (middleware de Vite, solo en `vite dev`).
// Solo acepta conexiones y orígenes de localhost. Nunca registra cuerpos, contraseñas ni tokens.
import { createAuthService, normalizeEmail } from './service.mjs'

export const SESSION_COOKIE = 'logixtic_local_session'
const MAX_BODY_BYTES = 8 * 1024
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function hostOnly(value) {
  return String(value ?? '')
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
}

export function isLoopbackRequest(req) {
  const ip = req.socket?.remoteAddress ?? ''
  return LOOPBACK_IPS.has(ip) && LOOPBACK_HOSTS.has(hostOnly(req.headers?.host))
}

/** Un Origin, si existe, debe ser de localhost. Sin Origin (peticiones de navegación) se admite. */
export function isAllowedOrigin(req) {
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ''))
  } catch {
    return false
  }
}

export function parseCookies(header) {
  const out = {}
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    if (key) out[key] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
}

function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers?.['content-type'] ?? '')
    if (!type.startsWith('application/json')) return reject(Object.assign(new Error('type'), { status: 415 }))
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('size'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        const parsed = text ? JSON.parse(text) : {}
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
        resolve(parsed)
      } catch {
        reject(Object.assign(new Error('json'), { status: 400 }))
      }
    })
    req.on('error', () => reject(Object.assign(new Error('io'), { status: 400 })))
  })
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function outboxPage(items, appOrigin) {
  const rows = items
    .map((o) => {
      const link = `${appOrigin}/restablecer-contrasena?token=${encodeURIComponent(o.token)}`
      return `<tr><td>${escapeHtml(o.email)}</td><td>${escapeHtml(o.createdAt)}</td><td><a href="${escapeHtml(link)}">Abrir enlace de recuperación</a></td></tr>`
    })
    .join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Bandeja local · Logixtic</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#11223a}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e1e8f2;padding:.6rem;text-align:left}a{color:#2563eb}</style></head>
<body><h1>Bandeja local de desarrollo</h1><p>Solo accesible desde localhost. Los enlaces expiran a los 15 minutos y se eliminan al usarse. No es un servicio de correo.</p>
${items.length ? `<table><thead><tr><th>Cuenta</th><th>Generado</th><th>Enlace</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No hay enlaces de recuperación pendientes.</p>'}
</body></html>`
}

/**
 * Crea el middleware. `store` es el almacén JSON; `legalVersion` define la versión de términos aceptada.
 */
export function createLocalAuthMiddleware({ store, tenantId, legalVersion, clock }) {
  const service = createAuthService({ store, tenantId, legalVersion, clock })

  async function handle(req, res) {
    if (!isLoopbackRequest(req)) return send(res, 403, { status: 'forbidden' })
    if (!isAllowedOrigin(req)) return send(res, 403, { status: 'forbidden_origin' })

    const path = String(req.url ?? '').split('?')[0]
    const cookies = parseCookies(req.headers?.cookie)
    const token = cookies[SESSION_COOKIE] ?? null

    try {
      // Bandeja local de recuperación (solo localhost; enlaces temporales).
      if (req.method === 'GET' && path === '/outbox') {
        const origin = `http://${String(req.headers?.host ?? '127.0.0.1:5173')}`
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(outboxPage(store.listOutbox(), origin))
        return
      }

      if (req.method === 'GET' && path === '/me') {
        const user = service.me(token)
        if (!user) return send(res, 401, { status: 'unauthenticated' })
        return send(res, 200, { status: 'ok', user })
      }

      if (req.method === 'POST' && path === '/register') {
        const body = await readJson(req)
        const out = await service.register(body)
        if (out.status !== 'ok') return send(res, out.status === 'email_taken' ? 409 : 422, out)
        return send(res, 201, { status: 'ok', user: out.user }, { 'Set-Cookie': sessionCookie(out.token, out.maxAge) })
      }

      if (req.method === 'POST' && path === '/login') {
        const body = await readJson(req)
        const out = await service.login({ email: normalizeEmail(body.email), password: body.password, remember: body.remember === true })
        if (out.status === 'locked') return send(res, 429, { status: 'locked' })
        if (out.status !== 'ok') return send(res, 401, { status: 'invalid' })
        return send(res, 200, { status: 'ok', user: out.user }, { 'Set-Cookie': sessionCookie(out.token, out.maxAge) })
      }

      if (req.method === 'POST' && path === '/logout') {
        await service.logout(token)
        return send(res, 200, { status: 'ok' }, { 'Set-Cookie': clearSessionCookie() })
      }

      if (req.method === 'POST' && path === '/forgot-password') {
        const body = await readJson(req)
        await service.forgotPassword(body.email)
        return send(res, 202, { status: 'accepted' })
      }

      if (req.method === 'POST' && path === '/reset-password') {
        const body = await readJson(req)
        const out = await service.resetPassword({ token: body.token, password: body.password })
        if (out.status !== 'ok') return send(res, 422, out)
        return send(res, 200, { status: 'ok' })
      }

      if (req.method === 'PATCH' && path === '/profile') {
        const body = await readJson(req)
        const out = await service.updateProfile(token, { fullName: body.fullName })
        if (out.status === 'unauthorized') return send(res, 401, { status: 'unauthenticated' })
        if (out.status !== 'ok') return send(res, 422, out)
        return send(res, 200, { status: 'ok', user: out.user })
      }

      if (req.method === 'POST' && path === '/change-password') {
        const body = await readJson(req)
        const out = await service.changePassword(token, { currentPassword: body.currentPassword, newPassword: body.newPassword })
        if (out.status === 'unauthorized') return send(res, 401, { status: 'unauthenticated' })
        if (out.status !== 'ok') return send(res, out.status === 'wrong_password' ? 422 : 422, out)
        return send(res, 200, { status: 'ok' })
      }

      return send(res, 404, { status: 'not_found' })
    } catch (err) {
      const status = err && typeof err.status === 'number' ? err.status : 500
      // Sin detalles internos ni del cuerpo recibido.
      return send(res, status, { status: status === 500 ? 'error' : 'bad_request' })
    }
  }

  return function localAuthMiddleware(req, res) {
    handle(req, res)
  }
}
