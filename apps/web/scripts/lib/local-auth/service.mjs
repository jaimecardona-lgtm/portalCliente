// Lógica de autenticación local (solo desarrollo). El servidor valida todo y decide el tenant y el rol.
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword, verifyPassword } from '../reviewer-credentials.mjs'
import { sha256 } from './store.mjs'

export const SESSION_TTL_SHORT_MS = 12 * 60 * 60 * 1000 // sin "recordar sesión": 12 horas
export const SESSION_TTL_REMEMBER_MS = 14 * 24 * 60 * 60 * 1000 // con "recordar sesión": 14 días
export const RESET_TTL_MS = 15 * 60 * 1000
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 256
const MAX_FAILURES = 5
const LOCK_MS = 60 * 1000
const FORGOT_COOLDOWN_MS = 60 * 1000

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/
const NAME_RE = /^[\p{L}\p{M}'’.\- ]{2,120}$/u

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function validateName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!NAME_RE.test(name)) return { error: 'Escribe tu nombre completo (2 a 120 letras).' }
  return { value: name }
}

export function validateEmail(value) {
  const email = normalizeEmail(value)
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Escribe un correo válido.' }
  return { value: email }
}

export function validateNewPassword(value) {
  const password = typeof value === 'string' ? value : ''
  if (password.length < MIN_PASSWORD) return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }
  if (password.length > MAX_PASSWORD) return { error: 'La contraseña es demasiado larga.' }
  return { value: password }
}

/** Vista pública del usuario: nunca incluye passwordHash. */
export function publicUser(u, tenantId) {
  return {
    id: u.id,
    tenantId: u.tenantId ?? tenantId,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt,
    termsVersionAccepted: u.termsVersionAccepted,
    termsAcceptedAt: u.termsAcceptedAt,
  }
}

export function createAuthService({ store, tenantId, legalVersion, clock = () => Date.now() }) {
  const failures = new Map() // email -> { count, lockedUntil }   (memoria del proceso)
  const forgotLast = new Map() // email -> timestamp

  const nowIso = () => new Date(clock()).toISOString()

  async function openSession(user, remember) {
    const ttl = remember ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_SHORT_MS
    const token = await store.createSession(user.id, ttl)
    return { token, maxAge: Math.floor(ttl / 1000) }
  }

  return {
    legalVersion,

    /** Crea la cuenta del cliente y abre sesión. El tenant y el rol los decide el servidor. */
    async register(input) {
      const name = validateName(input.fullName)
      if (name.error) return { status: 'invalid', field: 'fullName', message: name.error }
      const email = validateEmail(input.email)
      if (email.error) return { status: 'invalid', field: 'email', message: email.error }
      const password = validateNewPassword(input.password)
      if (password.error) return { status: 'invalid', field: 'password', message: password.error }
      if (input.acceptTerms !== true) return { status: 'invalid', field: 'terms', message: 'Debes aceptar los términos y condiciones para crear tu cuenta.' }
      if (input.termsVersion !== legalVersion) return { status: 'invalid', field: 'terms', message: 'La versión de los términos cambió. Revísalos y vuelve a aceptarlos.' }

      if (store.findUserByEmail(email.value)) return { status: 'email_taken' }

      const stamp = nowIso()
      const user = {
        id: randomUUID(),
        fullName: name.value,
        email: email.value,
        passwordHash: hashPassword(password.value),
        tenantId,
        role: 'client',
        status: 'active',
        createdAt: stamp,
        updatedAt: stamp,
        lastLoginAt: stamp,
        termsVersionAccepted: legalVersion,
        termsAcceptedAt: stamp,
      }
      const inserted = await store.insertUser(user)
      if (inserted.error) return { status: 'email_taken' }
      const session = await openSession(user, false)
      return { status: 'ok', user: publicUser(user, tenantId), ...session }
    },

    async login({ email, password, remember }) {
      const address = normalizeEmail(email)
      const state = failures.get(address) ?? { count: 0, lockedUntil: 0 }
      if (clock() < state.lockedUntil) return { status: 'locked' }

      const user = address ? store.findUserByEmail(address) : null
      const valid = Boolean(user && user.status === 'active' && verifyPassword(String(password ?? ''), user.passwordHash))
      if (!valid) {
        const count = state.count + 1
        failures.set(address, count >= MAX_FAILURES ? { count: 0, lockedUntil: clock() + LOCK_MS } : { count, lockedUntil: 0 })
        return { status: 'invalid' }
      }
      failures.delete(address)
      await store.updateUser(user.id, { lastLoginAt: nowIso() })
      const fresh = store.findUserById(user.id)
      const session = await openSession(fresh, Boolean(remember))
      return { status: 'ok', user: publicUser(fresh, tenantId), ...session }
    },

    async logout(token) {
      await store.deleteSession(token)
      return { status: 'ok' }
    },

    /** Usuario de la sesión (o null). Valida la sesión en el servidor, nunca por el cliente. */
    me(token) {
      const session = store.findSession(token)
      if (!session) return null
      const user = store.findUserById(session.userId)
      if (!user || user.status !== 'active') return null
      return publicUser(user, tenantId)
    },

    /** Respuesta siempre genérica: no revela si la cuenta existe. */
    async forgotPassword(email) {
      const address = normalizeEmail(email)
      const last = forgotLast.get(address) ?? 0
      const accepted = { status: 'accepted' }
      if (!EMAIL_RE.test(address) || clock() - last < FORGOT_COOLDOWN_MS) return accepted
      forgotLast.set(address, clock())
      const user = store.findUserByEmail(address)
      if (!user || user.status !== 'active') return accepted
      const token = randomBytes(32).toString('base64url')
      const expiresAt = clock() + RESET_TTL_MS
      await store.addResetToken({ userId: user.id, tokenHash: sha256(token), expiresAt })
      await store.addOutbox({ email: user.email, token, expiresAt })
      return accepted
    },

    async resetPassword({ token, password }) {
      const valid = validateNewPassword(password)
      if (valid.error) return { status: 'invalid', field: 'password', message: valid.error }
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { status: 'invalid_token' }
      const consumed = await store.consumeResetToken(sha256(token))
      if (!consumed) return { status: 'invalid_token' }
      await store.updateUser(consumed.userId, { passwordHash: hashPassword(valid.value) })
      await store.deleteUserSessions(consumed.userId)
      await store.removeOutboxToken(token)
      return { status: 'ok' }
    },

    async updateProfile(token, input) {
      const session = store.findSession(token)
      if (!session) return { status: 'unauthorized' }
      const name = validateName(input.fullName)
      if (name.error) return { status: 'invalid', field: 'fullName', message: name.error }
      const user = await store.updateUser(session.userId, { fullName: name.value })
      if (!user) return { status: 'unauthorized' }
      return { status: 'ok', user: publicUser(user, tenantId) }
    },

    async changePassword(token, input) {
      const session = store.findSession(token)
      if (!session) return { status: 'unauthorized' }
      const user = store.findUserById(session.userId)
      if (!user) return { status: 'unauthorized' }
      if (!verifyPassword(String(input.currentPassword ?? ''), user.passwordHash)) return { status: 'wrong_password' }
      const valid = validateNewPassword(input.newPassword)
      if (valid.error) return { status: 'invalid', field: 'newPassword', message: valid.error }
      if (valid.value === input.currentPassword) return { status: 'invalid', field: 'newPassword', message: 'La nueva contraseña debe ser distinta de la actual.' }
      await store.updateUser(user.id, { passwordHash: hashPassword(valid.value) })
      await store.deleteUserSessions(user.id, token)
      return { status: 'ok' }
    },
  }
}
