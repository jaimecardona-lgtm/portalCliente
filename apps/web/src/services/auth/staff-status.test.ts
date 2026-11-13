import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PortalApiError } from '@/services/api/http-client'
import type { StaffApi } from '@/services/api/staff-api'
import { resetStaffStatus, staffStatusFor } from './staff-status'

const STAFF_ME = { userId: '3f9c1a2e-0000-4000-8000-0000000000aa', fullName: 'Personal Sintético', staffRole: 'qa', permissions: [] }

function fakeStaff(me: () => Promise<unknown>): StaffApi {
  return { me: vi.fn(me) } as unknown as StaffApi
}

describe('staffStatusFor', () => {
  beforeEach(() => resetStaffStatus())

  it('devuelve "staff" con los datos del servidor y lo memoriza', async () => {
    const staff = fakeStaff(async () => STAFF_ME)
    expect(await staffStatusFor(staff)).toEqual({ kind: 'staff', me: STAFF_ME })
    await staffStatusFor(staff)
    expect(staff.me).toHaveBeenCalledTimes(1)
  })

  it('un 403 no_staff_role significa cliente y se memoriza', async () => {
    const staff = fakeStaff(async () => {
      throw new PortalApiError('no_staff_role', 'sin rol', 403)
    })
    expect(await staffStatusFor(staff)).toEqual({ kind: 'client' })
    await staffStatusFor(staff)
    expect(staff.me).toHaveBeenCalledTimes(1)
  })

  it('un error de red es "unknown" y no se memoriza: la siguiente consulta vuelve a preguntar', async () => {
    const staff = fakeStaff(async () => {
      throw new PortalApiError('network_error', 'sin red', 0)
    })
    expect(await staffStatusFor(staff)).toEqual({ kind: 'unknown' })
    expect(await staffStatusFor(staff)).toEqual({ kind: 'unknown' })
    expect(staff.me).toHaveBeenCalledTimes(2)
  })

  it('resetStaffStatus olvida el resultado anterior', async () => {
    const staff = fakeStaff(async () => STAFF_ME)
    await staffStatusFor(staff)
    resetStaffStatus()
    await staffStatusFor(staff)
    expect(staff.me).toHaveBeenCalledTimes(2)
  })
})
