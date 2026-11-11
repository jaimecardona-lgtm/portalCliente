// Middleware de desarrollo para el usuario local de revisión.
// Solo se registra en `vite dev` (ver vite.config.ts). Acepta peticiones únicamente desde loopback.
import { publicReviewerProfile, readReviewerConfig, verifyPassword } from './reviewer-credentials.mjs'

const MAX_FAILURES = 5
const LOCK_MS = 60_000
const MAX_BODY_BYTES = 4096
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** Verdadero solo si la conexión y el encabezado Host son de localhost. */
export function isLoopbackRequest(req) {
  const ip = req.socket?.remoteAddress ?? ''
  const host = String(req.headers?.host ?? '')
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
  return LOOPBACK_IPS.has(ip) && LOOPBACK_HOSTS.has(host)
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        resolve({})
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

/**
 * Crea el manejador. `clock` se inyecta para poder probar el bloqueo por intentos.
 * Estados de respuesta del login: ok | invalid | locked | not_reviewer | not_configured.
 */
export function createLocalReviewerMiddleware({ configPath, clock = () => Date.now() }) {
  const state = { failures: 0, lockedUntil: 0 }

  return async function localReviewerMiddleware(req, res) {
    if (!isLoopbackRequest(req)) {
      sendJson(res, 403, { status: 'forbidden' })
      return
    }

    const path = String(req.url ?? '').split('?')[0]
    const cfg = readReviewerConfig(configPath)

    if (req.method === 'GET' && path === '/reviewer') {
      if (!cfg) return sendJson(res, 404, { status: 'not_configured' })
      return sendJson(res, 200, { status: 'ok', user: publicReviewerProfile(cfg) })
    }

    if (req.method === 'POST' && path === '/login') {
      const body = await readJsonBody(req)
      if (!cfg) return sendJson(res, 404, { status: 'not_configured' })
      if (clock() < state.lockedUntil) return sendJson(res, 429, { status: 'locked' })

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (email !== cfg.user.email.trim().toLowerCase()) return sendJson(res, 200, { status: 'not_reviewer' })

      if (verifyPassword(body.password, cfg.credential)) {
        state.failures = 0
        return sendJson(res, 200, { status: 'ok', user: publicReviewerProfile(cfg) })
      }

      state.failures += 1
      if (state.failures >= MAX_FAILURES) {
        state.lockedUntil = clock() + LOCK_MS
        state.failures = 0
      }
      return sendJson(res, 401, { status: 'invalid' })
    }

    return sendJson(res, 404, { status: 'not_found' })
  }
}
