// Credenciales del usuario local de revisión.
// Solo para desarrollo en localhost. No es un mecanismo de autenticación seguro para clientes reales.
//
// La contraseña nunca se guarda en claro: se almacena un hash scrypt con sal aleatoria en
// `apps/web/local/reviewer.config.json`, ignorado por Git.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 256

/** Parámetros de scrypt. N=16384 equilibra seguridad y tiempo de respuesta en un equipo de desarrollo. */
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 }

/** Devuelve un mensaje de error en español, o null si la contraseña es aceptable. */
export function validatePassword(password, email = '') {
  if (typeof password !== 'string') return 'La contraseña no es válida.'
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (password.length > MAX_PASSWORD_LENGTH) return 'La contraseña es demasiado larga.'
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'La contraseña no puede ser igual al correo.'
  return null
}

/** Genera el registro de credencial: algoritmo, parámetros, sal y hash en hexadecimal. */
export function hashPassword(password, salt = randomBytes(16)) {
  const hash = scryptSync(password, salt, SCRYPT.keyLength, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem })
  return {
    algorithm: 'scrypt',
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    keyLength: SCRYPT.keyLength,
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
  }
}

/** Compara en tiempo constante. Cualquier registro malformado se rechaza. */
export function verifyPassword(password, record) {
  if (typeof password !== 'string' || !record || record.algorithm !== 'scrypt') return false
  try {
    const expected = Buffer.from(record.hash, 'hex')
    const salt = Buffer.from(record.salt, 'hex')
    if (expected.length === 0 || salt.length === 0) return false
    const actual = scryptSync(password, salt, expected.length, { N: record.N, r: record.r, p: record.p, maxmem: SCRYPT.maxmem })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Lee la configuración. Devuelve null si no existe o está incompleta. Nunca lanza. */
export function readReviewerConfig(path) {
  try {
    const cfg = JSON.parse(readFileSync(path, 'utf8'))
    if (cfg && cfg.user && typeof cfg.user.email === 'string' && cfg.credential) return cfg
    return null
  } catch {
    return null
  }
}

/** Escribe la configuración con permisos restrictivos (en Windows solo aplica la bandera de lectura). */
export function writeReviewerConfig(path, cfg) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 })
}

/** Perfil que puede enviarse al cliente local. No incluye la credencial. */
export function publicReviewerProfile(cfg) {
  return {
    id: cfg.user.id,
    tenantId: cfg.user.tenantId,
    fullName: cfg.user.fullName,
    email: cfg.user.email,
    role: cfg.user.role,
    // Campo requerido por el modelo de usuario de presentación local. Vacío: nunca coincide con una contraseña.
    demoPassword: '',
  }
}
