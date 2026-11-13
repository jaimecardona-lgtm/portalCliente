/**
 * Inicio de sesión (/login).
 *
 * Flujo con Supabase (modo real): validación con Zod, inicio de sesión en Supabase Auth y lectura de la cuenta
 * desde la API (GET /me). La aplicación no guarda credenciales ni tokens propios.
 * Flujo local (solo desarrollo sin proveedor): cuentas JSON del servidor de desarrollo, sin cambios.
 * Errores: ante credenciales incorrectas el mensaje es siempre genérico, para no revelar si el correo existe.
 * Restricciones: sin proveedor activo, el formulario queda deshabilitado con un aviso neutro.
 * Decisión no evidente: en modo Supabase no se ofrece "Recordar sesión" ni alta de cuentas: la duración la fija
 * Supabase y las cuentas se entregan por invitación. En modo local se mantiene la opción anterior.
 */
import { useContext, useState } from 'react'
import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Button, Field, inputClass } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { LOCAL_ACCESS_ENABLED, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { useOptionalRepository } from '@/services/repositories'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { useSession } from './session-context'
import { AuthLayout, PasswordInput } from './auth-layout'
import { loadLocalAuthApi, sessionForAccount } from './auth-gateway'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo electrónico.').email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
  remember: z.boolean(),
})

type LoginValues = z.infer<typeof loginSchema>

/** Texto neutro para usuarios: no revela detalles de configuración técnica. */
const ACCESS_UNAVAILABLE_MESSAGE = 'El acceso a Logixtic no está disponible en este momento. Contacta a tu ejecutivo de cuenta.'
const GENERIC_CREDENTIALS_ERROR = 'Correo o contraseña no válidos.'
const GENERIC_SIGNIN_ERROR = 'No fue posible iniciar sesión. Inténtalo de nuevo.'

export function LoginPage() {
  const { session, signIn, refreshAccount } = useSession()
  const repo = useOptionalRepository()
  const portal = useContext(SupabasePortalContext)
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const canSubmit = SUPABASE_ACCESS_ENABLED ? portal !== null : LOCAL_ACCESS_ENABLED && repo !== null

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', remember: false } })

  if (session && (LOCAL_ACCESS_ENABLED || SUPABASE_ACCESS_ENABLED)) return <Navigate to="/" />

  const target = search.redirect && search.redirect.startsWith('/') && !search.redirect.startsWith('/login') ? search.redirect : '/'

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)

    if (SUPABASE_ACCESS_ENABLED) {
      if (!portal) {
        setFormError(ACCESS_UNAVAILABLE_MESSAGE)
        return
      }
      const outcome = await portal.auth.signIn(values.email, values.password)
      if (outcome.status === 'invalid') {
        setFormError(GENERIC_CREDENTIALS_ERROR)
        return
      }
      if (outcome.status !== 'ok') {
        setFormError(GENERIC_SIGNIN_ERROR)
        return
      }
      // La sesión existe en Supabase. La cuenta y la empresa las confirma el servidor al leer /me.
      await refreshAccount()
      // Personal interno con rol activo: entra al panel de soporte sin empresa previa.
      const isStaff = await portal.staff.me().then(() => true, () => false)
      void navigate({ to: isStaff ? '/soporte' : target })
      return
    }

    const api = await loadLocalAuthApi()
    if (!canSubmit || !api) {
      setFormError(ACCESS_UNAVAILABLE_MESSAGE)
      return
    }
    const result = await api.loginAccount(values.email, values.password, values.remember)
    if (result.status === 'locked') {
      setFormError('Demasiados intentos. Espera un minuto antes de volver a intentarlo.')
      return
    }
    if (result.status === 'invalid') {
      setFormError(GENERIC_CREDENTIALS_ERROR)
      return
    }
    if (result.status !== 'ok') {
      setFormError(GENERIC_SIGNIN_ERROR)
      return
    }
    signIn(await sessionForAccount(repo, result.user))
    toast({ title: `Bienvenido, ${result.user.fullName.split(' ')[0]}` })
    void navigate({ to: target })
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Bienvenido a Logixtic</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        Accede a tu espacio de trabajo y gestiona tus operaciones logísticas desde un solo lugar.
      </p>

      {!canSubmit && (
        <p role="status" className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          {ACCESS_UNAVAILABLE_MESSAGE}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-5">
        <Field label="Correo electrónico" htmlFor="email" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="nombre@tuempresa.com"
            disabled={!canSubmit}
            aria-invalid={Boolean(errors.email)}
            className={inputClass}
            {...register('email')}
          />
        </Field>

        <PasswordInput
          id="password"
          label="Contraseña"
          autoComplete="current-password"
          error={errors.password?.message}
          disabled={!canSubmit}
          registration={register('password')}
        />

        {!SUPABASE_ACCESS_ENABLED && (
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" disabled={!canSubmit} className="mt-0.5 size-4 rounded border-line-strong accent-blue" {...register('remember')} />
            <span>
              Recordar sesión en este equipo
              <span className="block text-xs text-ink-muted">Se mantiene hasta 14 días. Sin esta opción, la sesión dura 12 horas.</span>
            </span>
          </label>
        )}

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <Button type="submit" size="md" loading={isSubmitting} disabled={!canSubmit} className="mt-1 h-12 w-full text-[15px]">
          Iniciar sesión <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-sm">
        <Link to="/recuperar-contrasena" className="font-medium text-blue hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
        {SUPABASE_ACCESS_ENABLED ? (
          <p className="text-ink-soft">El acceso a Logixtic se entrega por invitación de tu ejecutivo de cuenta.</p>
        ) : (
          <p className="text-ink-soft">
            ¿No tienes cuenta?{' '}
            <Link to="/registro" className="font-semibold text-blue hover:underline">
              Crear cuenta
            </Link>
          </p>
        )}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-ink-muted">
        Al iniciar sesión aceptas el uso del portal conforme a los{' '}
        <Link to="/terminos" className="text-blue hover:underline">términos y condiciones</Link> y la{' '}
        <Link to="/privacidad" className="text-blue hover:underline">política de privacidad</Link>.
      </p>
    </AuthLayout>
  )
}
