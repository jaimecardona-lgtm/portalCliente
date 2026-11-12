/**
 * Recuperación de contraseña: solicitud (/recuperar-contrasena) y restablecimiento (/restablecer-contrasena).
 *
 * Responsabilidad: pedir el enlace y definir una nueva contraseña con el token recibido en la URL.
 * Seguridad: la solicitud responde igual exista o no la cuenta. El token viaja solo en el enlace temporal,
 * se usa una vez y caduca a los 15 minutos. No se muestra en pantalla ni se guarda en el navegador.
 * Honestidad de la interfaz: la pantalla no afirma que se haya enviado un correo; en desarrollo indica
 * dónde consultar el enlace (bandeja local, solo localhost).
 */
import { useContext, useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Button, Field, inputClass } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { LOCAL_ACCESS_ENABLED, SUPABASE_ACCESS_ENABLED } from '@/config/runtime'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { AuthLayout, PasswordInput } from './auth-layout'
import { loadLocalAuthApi } from './auth-gateway'
import { PASSWORD_MIN_LENGTH } from './password-strength'

const UNAVAILABLE = 'La recuperación de contraseña no está disponible en este momento. Contacta a tu ejecutivo de cuenta.'

/** Ruta a la que Supabase devuelve al usuario desde el correo de recuperación. Debe estar en la lista de redirecciones. */
const RESET_PATH = '/restablecer-contrasena'

/* ---------------- Solicitud de recuperación ---------------- */

const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo electrónico.').email('Escribe un correo válido.'),
})
type ForgotValues = z.infer<typeof forgotSchema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const portal = useContext(SupabasePortalContext)
  const canUse = SUPABASE_ACCESS_ENABLED ? portal !== null : LOCAL_ACCESS_ENABLED
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  const onSubmit = async (values: ForgotValues) => {
    if (SUPABASE_ACCESS_ENABLED) {
      if (!portal) return
      // Supabase responde igual exista o no la cuenta; el servicio tampoco revela el resultado.
      await portal.auth.requestPasswordReset(values.email, `${window.location.origin}${RESET_PATH}`)
      setSent(true)
      return
    }
    const api = await loadLocalAuthApi()
    if (!LOCAL_ACCESS_ENABLED || !api) return
    await api.requestPasswordReset(values.email)
    // Respuesta genérica: no revela si el correo tiene cuenta ni afirma un envío real.
    setSent(true)
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Recuperar contraseña</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        Escribe el correo de tu cuenta. Si existe, generaremos un enlace temporal para crear una nueva contraseña.
      </p>

      {!canUse && (
        <p role="status" className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          {UNAVAILABLE}
        </p>
      )}

      {sent ? (
        <div role="status" className="mt-8 rounded-xl border border-success/30 bg-success-50 p-5">
          <p className="flex items-center gap-2 font-semibold text-success-700">
            <CheckCircle2 className="size-5" aria-hidden /> Solicitud registrada
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {SUPABASE_ACCESS_ENABLED
              ? 'Si el correo corresponde a una cuenta, recibirás un enlace para crear una nueva contraseña.'
              : 'Si el correo corresponde a una cuenta, se generó un enlace de recuperación válido por 15 minutos.'}
          </p>
          {import.meta.env.DEV && LOCAL_ACCESS_ENABLED && (
            <p className="mt-3 text-sm text-ink-soft">
              Entorno de desarrollo: el enlace está disponible solo desde este equipo en{' '}
              <a href="/__local-auth/outbox" className="font-semibold text-blue hover:underline">la bandeja local</a>.
            </p>
          )}
          <Link to="/login" className="mt-4 inline-flex text-sm font-semibold text-blue hover:underline">Volver a iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-5">
          <Field label="Correo electrónico" htmlFor="email" error={errors.email?.message}>
            <input id="email" type="email" autoComplete="username" placeholder="nombre@tuempresa.com" disabled={!canUse} aria-invalid={Boolean(errors.email)} className={inputClass} {...register('email')} />
          </Field>
          <Button type="submit" size="md" loading={isSubmitting} disabled={!canUse} className="h-12 w-full text-[15px]">
            Enviar enlace de recuperación <ArrowRight className="size-4" aria-hidden />
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        <Link to="/login" className="font-semibold text-blue hover:underline">Volver a iniciar sesión</Link>
      </p>
    </AuthLayout>
  )
}

/* ---------------- Restablecimiento con enlace ---------------- */

const resetSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`).max(256),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña.'),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Las contraseñas no coinciden.', path: ['confirmPassword'] })
type ResetValues = z.infer<typeof resetSchema>

export function ResetPasswordPage() {
  const search = useSearch({ strict: false }) as { token?: string }
  const navigate = useNavigate()
  const { toast } = useToast()
  const [status, setStatus] = useState<'idle' | 'done' | 'invalid_token'>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const token = typeof search.token === 'string' ? search.token : ''
  const portal = useContext(SupabasePortalContext)
  // Modo Supabase: el enlace deja una sesión de recuperación (PKCE). Se comprueba antes de mostrar el formulario.
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking')

  useEffect(() => {
    if (!SUPABASE_ACCESS_ENABLED) return undefined
    if (!portal) {
      setLinkState('invalid')
      return undefined
    }
    let cancelled = false
    void portal.auth.accessToken().then((accessToken) => {
      if (!cancelled) setLinkState(accessToken ? 'valid' : 'invalid')
    })
    return () => {
      cancelled = true
    }
  }, [portal])

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } })
  const password = watch('password')

  const onSubmit = async (values: ResetValues) => {
    setFormError(null)
    if (SUPABASE_ACCESS_ENABLED) {
      if (!portal) {
        setFormError(UNAVAILABLE)
        return
      }
      const outcome = await portal.auth.updatePassword(values.password)
      if (outcome.status !== 'ok') {
        setFormError('No fue posible guardar la contraseña. Revisa los requisitos o solicita un nuevo enlace.')
        return
      }
      // Se cierra la sesión de recuperación: la persona entra de nuevo con la contraseña nueva.
      await portal.auth.signOut()
      setStatus('done')
      toast({ title: 'Contraseña actualizada', description: 'Inicia sesión con tu nueva contraseña.' })
      return
    }
    const api = await loadLocalAuthApi()
    if (!LOCAL_ACCESS_ENABLED || !api) {
      setFormError(UNAVAILABLE)
      return
    }
    const result = await api.resetPassword(token, values.password)
    if (result.status === 'ok') {
      setStatus('done')
      toast({ title: 'Contraseña actualizada', description: 'Inicia sesión con tu nueva contraseña.' })
      return
    }
    if (result.status === 'invalid_token') {
      setStatus('invalid_token')
      return
    }
    if (result.status === 'invalid' && result.field === 'password') {
      setError('password', { message: result.message ?? 'Revisa la contraseña.' })
      return
    }
    setFormError('No fue posible restablecer la contraseña. Inténtalo de nuevo.')
  }

  if (status === 'done') {
    return (
      <AuthLayout>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Contraseña actualizada</h1>
        <p className="mt-3 text-[15px] text-ink-muted">Tu contraseña se cambió y las sesiones anteriores se cerraron.</p>
        <Button className="mt-8 h-12 w-full" onClick={() => void navigate({ to: '/login' })}>Ir a iniciar sesión</Button>
      </AuthLayout>
    )
  }

  if (SUPABASE_ACCESS_ENABLED && linkState === 'checking') {
    return (
      <AuthLayout>
        <p role="status" className="text-[15px] text-ink-muted">Verificando el enlace…</p>
      </AuthLayout>
    )
  }

  const linkMissing = SUPABASE_ACCESS_ENABLED ? linkState === 'invalid' : !token
  if (linkMissing || status === 'invalid_token') {
    return (
      <AuthLayout>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Enlace no válido</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          El enlace no es válido, ya se usó o venció (caducan a los 15 minutos). Solicita uno nuevo.
        </p>
        <Link to="/recuperar-contrasena" className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue text-[15px] font-medium text-white hover:bg-navy">
          Solicitar un nuevo enlace
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Crea una nueva contraseña</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">Al guardarla, todas tus sesiones anteriores se cerrarán.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-5">
        <PasswordInput
          id="password"
          label="Nueva contraseña"
          autoComplete="new-password"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Recomendado: 12 o más.`}
          error={errors.password?.message}
          registration={register('password')}
          showStrength
          value={password}
        />
        <PasswordInput
          id="confirmPassword"
          label="Confirmar nueva contraseña"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          registration={register('confirmPassword')}
        />
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{formError}</p>
        )}
        <Button type="submit" size="md" loading={isSubmitting} className="h-12 w-full text-[15px]">
          Guardar nueva contraseña <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
    </AuthLayout>
  )
}
