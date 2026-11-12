import { describe, it, expect } from 'vitest'
import { PortalApiError } from '@/services/api/http-client'
import { accountIssueFor, accountIssueMessage, roleLabel } from './account-issues'

const apiError = (code: string) => new PortalApiError(code, 'mensaje del servidor', 403)

describe('accountIssueFor', () => {
  it('sin error no hay problema de cuenta', () => {
    expect(accountIssueFor(null)).toBeNull()
    expect(accountIssueFor(undefined)).toBeNull()
  })

  it('token ausente o inválido pide iniciar sesión de nuevo', () => {
    expect(accountIssueFor(apiError('authentication_required'))).toBe('session')
    expect(accountIssueFor(apiError('invalid_token'))).toBe('session')
  })

  it('sin membresía, suspensión y selección de empresa tienen estado propio', () => {
    expect(accountIssueFor(apiError('no_tenant_membership'))).toBe('no-membership')
    expect(accountIssueFor(apiError('tenant_inactive'))).toBe('suspended')
    expect(accountIssueFor(apiError('profile_inactive'))).toBe('suspended')
    expect(accountIssueFor(apiError('tenant_selection_required'))).toBe('tenant-selection')
  })

  it('un código desconocido o un fallo de red se tratan como no disponible', () => {
    expect(accountIssueFor(apiError('auth_not_configured'))).toBe('unavailable')
    expect(accountIssueFor(apiError('algo_nuevo'))).toBe('unavailable')
    expect(accountIssueFor(new TypeError('Failed to fetch'))).toBe('unavailable')
  })
})

describe('mensajes de cuenta', () => {
  it('ningún mensaje muestra el código técnico ni el texto del servidor', () => {
    const issues = ['session', 'no-membership', 'suspended', 'tenant-selection', 'unavailable'] as const
    for (const issue of issues) {
      const text = accountIssueMessage(issue)
      expect(text.length).toBeGreaterThan(10)
      expect(text).not.toMatch(/_/)
      expect(text).not.toContain('mensaje del servidor')
    }
  })
})

describe('roleLabel', () => {
  it('traduce los roles del servidor y no muestra un rol desconocido tal cual', () => {
    expect(roleLabel('client_admin')).toBe('Administrador de empresa')
    expect(roleLabel('client_viewer')).toBe('Solo lectura')
    expect(roleLabel('superuser')).toBe('Usuario del portal')
  })
})
