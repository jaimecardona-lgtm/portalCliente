import type { AccountProfile } from '@/features/auth/account-mapping'

/**
 * Cliente del acceso local de desarrollo. Solo se importa en `vite dev` (ver features/auth/auth-gateway.ts).
 * El navegador nunca lee ni escribe el archivo JSON: todo pasa por el servidor de desarrollo,
 * que valida, aplica límites y gestiona la cookie de sesión HttpOnly.
 */
const BASE = '/__local-auth'

/** Respuesta de error de validación, con el campo afectado. */
export interface FieldError {
  field: string
  message: string
}

export type ApiResult<T extends object = object> =
  | ({ status: 'ok' } & T)
  | { status: 'invalid'; field?: string; message?: string }
  | { status: 'email_taken' }
  | { status: 'invalid_token' }
  | { status: 'locked' }
  | { status: 'unauthenticated' }
  | { status: 'wrong_password' }
  | { status: 'unavailable' }

async function call(method: string, path: string, body?: unknown): Promise<{ http: number; data: Record<string, unknown> }> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      data = {}
    }
    return { http: response.status, data }
  } catch {
    return { http: 0, data: {} }
  }
}

/** Usuario de la sesión actual (cookie HttpOnly validada por el servidor), o null. */
export async function getSessionAccount(): Promise<AccountProfile | null> {
  const { http, data } = await call('GET', '/me')
  if (http !== 200 || !data.user) return null
  return data.user as AccountProfile
}

export async function registerAccount(input: {
  fullName: string
  email: string
  password: string
  acceptTerms: boolean
  termsVersion: string
}): Promise<ApiResult<{ user: AccountProfile }>> {
  const { http, data } = await call('POST', '/register', input)
  if (http === 0) return { status: 'unavailable' }
  if (http === 201 && data.user) return { status: 'ok', user: data.user as AccountProfile }
  if (http === 409) return { status: 'email_taken' }
  if (http === 422) return { status: 'invalid', field: data.field as string, message: data.message as string }
  return { status: 'unavailable' }
}

export async function loginAccount(email: string, password: string, remember: boolean): Promise<ApiResult<{ user: AccountProfile }>> {
  const { http, data } = await call('POST', '/login', { email, password, remember })
  if (http === 0) return { status: 'unavailable' }
  if (http === 200 && data.user) return { status: 'ok', user: data.user as AccountProfile }
  if (http === 429) return { status: 'locked' }
  if (http === 401) return { status: 'invalid' }
  return { status: 'unavailable' }
}

export async function logoutAccount(): Promise<void> {
  await call('POST', '/logout')
}

/** Siempre responde "aceptado": no revela si el correo tiene cuenta. */
export async function requestPasswordReset(email: string): Promise<void> {
  await call('POST', '/forgot-password', { email })
}

export async function resetPassword(token: string, password: string): Promise<ApiResult> {
  const { http, data } = await call('POST', '/reset-password', { token, password })
  if (http === 0) return { status: 'unavailable' }
  if (http === 200) return { status: 'ok' }
  if (http === 422 && data.status === 'invalid_token') return { status: 'invalid_token' }
  if (http === 422) return { status: 'invalid', field: data.field as string, message: data.message as string }
  return { status: 'unavailable' }
}

export async function updateName(fullName: string): Promise<ApiResult<{ user: AccountProfile }>> {
  const { http, data } = await call('PATCH', '/profile', { fullName })
  if (http === 0) return { status: 'unavailable' }
  if (http === 200 && data.user) return { status: 'ok', user: data.user as AccountProfile }
  if (http === 401) return { status: 'unauthenticated' }
  if (http === 422) return { status: 'invalid', field: data.field as string, message: data.message as string }
  return { status: 'unavailable' }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<ApiResult> {
  const { http, data } = await call('POST', '/change-password', { currentPassword, newPassword })
  if (http === 0) return { status: 'unavailable' }
  if (http === 200) return { status: 'ok' }
  if (http === 401) return { status: 'unauthenticated' }
  if (http === 422 && data.status === 'wrong_password') return { status: 'wrong_password' }
  if (http === 422) return { status: 'invalid', field: data.field as string, message: data.message as string }
  return { status: 'unavailable' }
}
