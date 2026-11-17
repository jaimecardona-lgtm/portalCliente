import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPersistedStaffTenant,
  persistStaffTenant,
  readPersistedStaffTenantId,
} from './staff-context'

const USER_A = 'user-a'
const USER_B = 'user-b'

afterEach(() => {
  clearPersistedStaffTenant()
  window.localStorage.clear()
})

describe('persistencia del tenant de personal interno', () => {
  it('conserva el UUID en almacenamiento compartido entre pestañas y lo separa por usuario', () => {
    persistStaffTenant(USER_A, 'tenant-a')

    expect(readPersistedStaffTenantId(USER_A)).toBe('tenant-a')
    expect(readPersistedStaffTenantId(USER_B)).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('borra solo preferencias de tenant del portal', () => {
    window.localStorage.setItem('otra-aplicacion', 'conservar')
    persistStaffTenant(USER_A, 'tenant-a')
    persistStaffTenant(USER_B, 'tenant-b')

    clearPersistedStaffTenant()

    expect(readPersistedStaffTenantId(USER_A)).toBeNull()
    expect(readPersistedStaffTenantId(USER_B)).toBeNull()
    expect(window.localStorage.getItem('otra-aplicacion')).toBe('conservar')
  })
})
