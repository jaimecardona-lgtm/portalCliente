// Almacenamiento JSON de desarrollo para el acceso local.
// Ubicación: apps/web/local/auth/ (ignorado por Git, fuera de public/ y src/).
//
// - Escrituras atómicas: se escribe un archivo temporal y se renombra sobre el destino.
// - Escrituras serializadas: todas las modificaciones pasan por una cola en memoria, así que
//   peticiones simultáneas no pierden registros.
// - Nunca se guardan contraseñas en claro. Las sesiones y los tokens de recuperación se guardan
//   solo como hash SHA-256; la bandeja local de recuperación guarda el enlace temporal (15 min).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EMPTY = { version: 1, items: [] }

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

export function createStore({ dir, legacyReviewerConfigPath, tenantId, clock = () => Date.now() }) {
  const files = {
    users: join(dir, 'users.json'),
    sessions: join(dir, 'sessions.json'),
    resetTokens: join(dir, 'reset-tokens.json'),
    outbox: join(dir, 'outbox.json'),
  }
  let queue = Promise.resolve()

  function read(name) {
    if (!existsSync(files[name])) return structuredClone(EMPTY)
    try {
      const data = JSON.parse(readFileSync(files[name], 'utf8'))
      return data && Array.isArray(data.items) ? data : structuredClone(EMPTY)
    } catch {
      // Un archivo corrupto no se sobrescribe a ciegas: se trata como vacío y se registra el hecho sin contenido.
      console.warn(`[local-auth] El archivo ${name} no se pudo leer; se usa una colección vacía.`)
      return structuredClone(EMPTY)
    }
  }

  function writeAtomic(name, data) {
    mkdirSync(dir, { recursive: true })
    const tmp = `${files[name]}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, files[name])
  }

  /** Ejecuta `mutate` con la colección actual, dentro de la cola. `mutate` devuelve { result, next? }. */
  function transact(name, mutate) {
    const run = queue.then(() => {
      const { result, next } = mutate(read(name))
      if (next) writeAtomic(name, next)
      return result
    })
    queue = run.catch(() => {})
    return run
  }

  /** Migra la configuración anterior de usuario de revisión, si existe, sin borrar nada. */
  async function migrateLegacyReviewer(legacyCfg) {
    if (!legacyCfg || !legacyCfg.user || !legacyCfg.credential) return
    await transact('users', (data) => {
      const email = String(legacyCfg.user.email).trim().toLowerCase()
      if (data.items.some((u) => u.email === email)) return { result: false }
      const now = new Date(clock()).toISOString()
      const user = {
        id: legacyCfg.user.id && String(legacyCfg.user.id).length > 0 ? `${legacyCfg.user.id}` : randomUUID(),
        fullName: String(legacyCfg.user.fullName),
        email,
        passwordHash: legacyCfg.credential,
        tenantId,
        role: 'client',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        termsVersionAccepted: null,
        termsAcceptedAt: null,
      }
      return { result: true, next: { version: 1, items: [...data.items, user] } }
    })
  }

  return {
    files,
    async init(loadLegacy) {
      await migrateLegacyReviewer(loadLegacy ? loadLegacy(legacyReviewerConfigPath) : null)
    },

    // ---- usuarios ----
    findUserByEmail(email) {
      return read('users').items.find((u) => u.email === email) ?? null
    },
    findUserById(id) {
      return read('users').items.find((u) => u.id === id) ?? null
    },
    insertUser(user) {
      return transact('users', (data) => {
        if (data.items.some((u) => u.email === user.email)) return { result: { error: 'email_taken' } }
        return { result: { user }, next: { version: 1, items: [...data.items, user] } }
      })
    },
    updateUser(id, patch) {
      return transact('users', (data) => {
        const index = data.items.findIndex((u) => u.id === id)
        if (index < 0) return { result: null }
        const updated = { ...data.items[index], ...patch, updatedAt: new Date(clock()).toISOString() }
        const items = [...data.items]
        items[index] = updated
        return { result: updated, next: { version: 1, items } }
      })
    },

    // ---- sesiones (token aleatorio; en disco solo su hash) ----
    createSession(userId, ttlMs) {
      const token = randomBytes(32).toString('base64url')
      const now = clock()
      return transact('sessions', (data) => {
        const live = data.items.filter((s) => s.expiresAt > now)
        const session = { tokenHash: sha256(token), userId, createdAt: new Date(now).toISOString(), expiresAt: now + ttlMs }
        return { result: token, next: { version: 1, items: [...live, session] } }
      })
    },
    findSession(token) {
      if (!token) return null
      const now = clock()
      const hash = sha256(token)
      const session = read('sessions').items.find((s) => s.tokenHash === hash && s.expiresAt > now)
      return session ?? null
    },
    deleteSession(token) {
      if (!token) return Promise.resolve(false)
      const hash = sha256(token)
      return transact('sessions', (data) => {
        const items = data.items.filter((s) => s.tokenHash !== hash)
        return { result: items.length !== data.items.length, next: { version: 1, items } }
      })
    },
    deleteUserSessions(userId, keepToken = null) {
      const keep = keepToken ? sha256(keepToken) : null
      return transact('sessions', (data) => {
        const items = data.items.filter((s) => s.userId !== userId || s.tokenHash === keep)
        return { result: data.items.length - items.length, next: { version: 1, items } }
      })
    },

    // ---- tokens de recuperación (un uso, 15 minutos) ----
    addResetToken({ userId, tokenHash, expiresAt }) {
      return transact('resetTokens', (data) => {
        const now = clock()
        const live = data.items.filter((t) => t.expiresAt > now && !t.usedAt)
        return { result: true, next: { version: 1, items: [...live, { id: randomUUID(), userId, tokenHash, expiresAt, usedAt: null }] } }
      })
    },
    consumeResetToken(tokenHash, userId = null) {
      const now = clock()
      return transact('resetTokens', (data) => {
        const index = data.items.findIndex((t) => t.tokenHash === tokenHash && !t.usedAt && t.expiresAt > now && (!userId || t.userId === userId))
        if (index < 0) return { result: null }
        const items = [...data.items]
        items[index] = { ...items[index], usedAt: new Date(now).toISOString() }
        return { result: items[index], next: { version: 1, items } }
      })
    },

    // ---- bandeja local de desarrollo (solo localhost; enlaces temporales) ----
    addOutbox({ email, token, expiresAt }) {
      return transact('outbox', (data) => {
        const now = clock()
        const live = data.items.filter((o) => o.expiresAt > now)
        return { result: true, next: { version: 1, items: [...live, { email, token, expiresAt, createdAt: new Date(now).toISOString() }] } }
      })
    },
    listOutbox() {
      const now = clock()
      return read('outbox').items.filter((o) => o.expiresAt > now)
    },
    removeOutboxToken(token) {
      return transact('outbox', (data) => {
        const items = data.items.filter((o) => o.token !== token)
        return { result: true, next: { version: 1, items } }
      })
    },
  }
}
