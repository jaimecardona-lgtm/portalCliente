import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Button, Field, inputClass } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { LOCAL_ACCESS_ENABLED } from '@/config/runtime'
import legal from '@/content/legal/legal-meta.json'
import { useOptionalRepository } from '@/services/repositories'
import { useSession } from './session-context'
import { AuthLayout, PasswordInput } from './auth-layout'
import { loadLocalAuthApi, sessionForAccount } from './auth-gateway'
import { PASSWORD_MIN_LENGTH } from './password-strength'
import { useState } from 'react'

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Escribe tu nombre completo.').max(120, 'El nombre es demasiado largo.'),
    email: z.string().trim().min(1, 'Escribe tu correo electrónico.').email('Escribe un correo válido.'),
    password: z.string().min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`).max(256, 'La contraseña es demasiado larga.'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña.'),
    acceptTerms: z.literal(true, { message: 'Debes aceptar los términos y condiciones para continuar.' }),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Las contraseñas no coinciden.', path: ['confirmPassword'] })

type RegisterValues = z.infer<typeof registerSchema>

const UNAVAILABLE = 'El alta de cuentas no está disponible en este momento. Contacta a tu ejecutivo de cuenta para recibir tu acceso.'

export function RegisterPage() {
  const { session, signIn } = useSession()
  const repo = useOptionalRepository()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const canSubmit = LOCAL_ACCESS_ENABLED && repo !== null

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', acceptTerms: undefined as unknown as true },
  })
  const password = watch('password')

  if (session && LOCAL_ACCESS_ENABLED) return <Navigate to="/" />

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null)
    const api = await loadLocalAuthApi()
    if (!canSubmit || !api) {
      setFormError(UNAVAILABLE)
      return
    }
    const result = await api.registerAccount({
      fullName: values.fullName,
      email: values.email,
      password: values.password,
      acceptTerms: true,
      termsVersion: legal.version,
    })
    if (result.status === 'ok') {
      signIn(await sessionForAccount(repo, result.user))
      toast({ title: 'Cuenta creada', description: `Bienvenido a Logixtic, ${result.user.fullName.split(' ')[0]}.` })
      void navigate({ to: '/' })
      return
    }
    if (result.status === 'email_taken') {
      setError('email', { message: 'Ya existe una cuenta con este correo. ¿Quieres iniciar sesión?' })
      return
    }
    if (result.status === 'invalid' && result.field) {
      const field = result.field as keyof RegisterValues
      if (field === 'fullName' || field === 'email' || field === 'password') {
        setError(field, { message: result.message ?? 'Revisa este campo.' })
        return
      }
      setFormError(result.message ?? 'Revisa los datos del formulario.')
      return
    }
    setFormError('No fue posible crear la cuenta. Inténtalo de nuevo.')
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Crear mi cuenta</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        Regístrate con tus datos para acceder al portal. Tu cuenta quedará asociada a tu empresa.
      </p>

      {!canSubmit && (
        <p role="status" className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          {UNAVAILABLE}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-5">
        <Field label="Nombre completo" htmlFor="fullName" error={errors.fullName?.message}>
          <input id="fullName" autoComplete="name" disabled={!canSubmit} aria-invalid={Boolean(errors.fullName)} className={inputClass} {...register('fullName')} />
        </Field>

        <Field label="Correo electrónico" htmlFor="email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" placeholder="nombre@tuempresa.com" disabled={!canSubmit} aria-invalid={Boolean(errors.email)} className={inputClass} {...register('email')} />
        </Field>

        <PasswordInput
          id="password"
          label="Contraseña"
          autoComplete="new-password"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Recomendado: 12 o más, combinando mayúsculas, minúsculas, números o símbolos.`}
          error={errors.password?.message}
          disabled={!canSubmit}
          registration={register('password')}
          showStrength
          value={password}
        />

        <PasswordInput
          id="confirmPassword"
          label="Confirmar contraseña"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          disabled={!canSubmit}
          registration={register('confirmPassword')}
        />

        <div>
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input
              id="acceptTerms"
              type="checkbox"
              disabled={!canSubmit}
              aria-invalid={Boolean(errors.acceptTerms)}
              aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
              className="mt-0.5 size-4 rounded border-line-strong accent-blue"
              {...register('acceptTerms')}
            />
            <span>
              He leído y acepto los{' '}
              <Link to="/terminos" className="font-medium text-blue hover:underline">términos y condiciones</Link> y la{' '}
              <Link to="/privacidad" className="font-medium text-blue hover:underline">política de privacidad</Link>.
              <span className="block text-xs text-ink-muted">Versión de términos: {legal.version}</span>
            </span>
          </label>
          {errors.acceptTerms && (
            <p id="acceptTerms-error" role="alert" className="mt-1.5 text-xs text-danger-700">{errors.acceptTerms.message}</p>
          )}
        </div>

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <Button type="submit" size="md" loading={isSubmitting} disabled={!canSubmit} className="mt-1 h-12 w-full text-[15px]">
          Crear mi cuenta <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        ¿Ya tienes una cuenta?{' '}
        <Link to="/login" className="font-semibold text-blue hover:underline">Iniciar sesión</Link>
      </p>
    </AuthLayout>
  )
}
