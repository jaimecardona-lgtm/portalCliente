import { describe, it, expect, vi } from 'vitest'
import { readSupabaseConfig, SupabaseConfigError, jwtRole } from './supabase-config'
import { createSupabaseSessionService, type SupabaseAuthLike } from './supabase-session'
import { selectTenant } from './membership'

const URL_OK = 'https://proyecto-prueba.supabase.test'
const PUBLISHABLE = 'sb_publishable_clave_sintetica_1234567890'

/** Crea un JWT sin firma válida (solo para leer el rol declarado en pruebas). */
function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.firma-sintetica`
}

describe('readSupabaseConfig', () => {
  it('sin variables devuelve null: no se inventa configuración', () => {
    expect(readSupabaseConfig({})).toBeNull()
  })

  it('acepta URL https y clave publicable', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: `${URL_OK}/`, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toEqual({
      url: URL_OK,
      publishableKey: PUBLISHABLE,
    })
  })

  it('acepta http solo en loopback para desarrollo', () => {
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }),
    ).not.toThrow()
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: 'http://proyecto.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }),
    ).toThrow(SupabaseConfigError)
  })

  it('rechaza una clave secreta sb_secret_', () => {
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sintetica' }),
    ).toThrow(/privilegios de servicio/)
  })

  it('rechaza una clave JWT con rol service_role aunque tenga otro nombre', () => {
    const key = fakeJwt({ role: 'service_role', iss: 'supabase' })
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(
      SupabaseConfigError,
    )
  })

  it('exige ambas variables si se define una', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK })).toThrow(SupabaseConfigError)
  })

  it('jwtRole devuelve null para valores que no son JWT', () => {
    expect(jwtRole('no-es-jwt')).toBeNull()
    expect(jwtRole(fakeJwt({ role: 'anon' }))).toBe('anon')
  })
})

interface FakeOptions {
  signIn?: { session: { access_token: string } | null; error: { status?: number; message: string } | null }
  throwOn?: string
}

function fakeClient(opts: FakeOptions = {}) {
  const fns = {
    signInWithPassword: vi.fn(async () => {
      if (opts.throwOn === 'signIn') throw new TypeError('network down')
      const result = opts.signIn ?? { session: null, error: null }
      return { data: { session: result.session }, error: result.error }
    }),
    signOut: vi.fn(async () => {
      if (opts.throwOn === 'signOut') throw new TypeError('network down')
      return { error: null }
    }),
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-sintetico' } }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    unsubscribe: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
  }
  const client: SupabaseAuthLike = {
    auth: {
      signInWithPassword: fns.signInWithPassword as unknown as SupabaseAuthLike['auth']['signInWithPassword'],
      signOut: fns.signOut,
      getSession: fns.getSession as unknown as SupabaseAuthLike['auth']['getSession'],
      resetPasswordForEmail: fns.resetPasswordForEmail,
      updateUser: fns.updateUser,
      onAuthStateChange: fns.onAuthStateChange as unknown as SupabaseAuthLike['auth']['onAuthStateChange'],
    },
  }
  return { client, fns }
}

describe('createSupabaseSessionService', () => {
  it('signIn normaliza el correo y devuelve ok con sesión', async () => {
    const { client, fns } = fakeClient({ signIn: { session: { access_token: 't' }, error: null } })
    const svc = createSupabaseSessionService(client)
    expect(await svc.signIn('  Ana@Cliente.TEST ', 'clave-sintetica')).toEqual({ status: 'ok' })
    expect(fns.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@cliente.test', password: 'clave-sintetica' })
  })

  it('credenciales incorrectas devuelven invalid sin revelar el mensaje del proveedor', async () => {
    const { client } = fakeClient({ signIn: { session: null, error: { status: 400, message: 'Invalid login credentials' } } })
    expect(await createSupabaseSessionService(client).signIn('a@b.test', 'x')).toEqual({ status: 'invalid' })
  })

  it('un fallo de red devuelve unavailable', async () => {
    const { client } = fakeClient({ throwOn: 'signIn' })
    expect(await createSupabaseSessionService(client).signIn('a@b.test', 'x')).toEqual({ status: 'unavailable' })
  })

  it('accessToken devuelve el token vigente o null si no hay sesión', async () => {
    const { client, fns } = fakeClient()
    const svc = createSupabaseSessionService(client)
    expect(await svc.accessToken()).toBe('tok-sintetico')
    fns.getSession.mockResolvedValueOnce({ data: { session: null } as never, error: null })
    expect(await svc.accessToken()).toBeNull()
  })

  it('cerrar sesión llama al proveedor aunque la red falle', async () => {
    const { client, fns } = fakeClient({ throwOn: 'signOut' })
    await expect(createSupabaseSessionService(client).signOut()).resolves.toBeUndefined()
    expect(fns.signOut).toHaveBeenCalled()
  })

  it('pedir restablecimiento usa redirectTo y responde ok', async () => {
    const { client, fns } = fakeClient()
    const out = await createSupabaseSessionService(client).requestPasswordReset(
      'ana@cliente.test',
      'https://portal.example.test/restablecer',
    )
    expect(out).toEqual({ status: 'ok' })
    expect(fns.resetPasswordForEmail).toHaveBeenCalledWith('ana@cliente.test', {
      redirectTo: 'https://portal.example.test/restablecer',
    })
  })

  it('suscripción a cambios de sesión se cancela', () => {
    const unsubscribe = vi.fn()
    const client: SupabaseAuthLike = {
      auth: {
        signInWithPassword: vi.fn() as unknown as SupabaseAuthLike['auth']['signInWithPassword'],
        signOut: vi.fn() as unknown as SupabaseAuthLike['auth']['signOut'],
        getSession: vi.fn() as unknown as SupabaseAuthLike['auth']['getSession'],
        resetPasswordForEmail: vi.fn() as unknown as SupabaseAuthLike['auth']['resetPasswordForEmail'],
        updateUser: vi.fn() as unknown as SupabaseAuthLike['auth']['updateUser'],
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })) as unknown as SupabaseAuthLike['auth']['onAuthStateChange'],
      },
    }
    const stop = createSupabaseSessionService(client).onSessionChange(() => undefined)
    stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('selectTenant', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'

  it('sin membresías no hay empresa', () => {
    expect(selectTenant([])).toEqual({ status: 'none' })
  })

  it('una sola membresía se usa sin preguntar', () => {
    expect(selectTenant([{ tenantId: A }])).toEqual({ status: 'single', tenantId: A })
  })

  it('varias membresías obligan a elegir', () => {
    expect(selectTenant([{ tenantId: A }, { tenantId: B }])).toEqual({ status: 'choose', options: [A, B] })
  })

  it('una elección que no está entre las membresías se rechaza', () => {
    expect(selectTenant([{ tenantId: A }], B)).toEqual({ status: 'invalid' })
  })

  it('una elección válida se acepta', () => {
    expect(selectTenant([{ tenantId: A }, { tenantId: B }], B)).toEqual({ status: 'single', tenantId: B })
  })
})
