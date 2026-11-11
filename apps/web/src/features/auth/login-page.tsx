import { useState } from 'react'
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, FlaskConical, ShieldAlert, ArrowRight, Globe2 } from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { Button, Field, inputClass } from '@/components/ui/primitives'
import { useRepository } from '@/services/repositories'
import { useSession } from './session-context'
import { authenticateDemo, DEMO_CREDENTIAL_HINT } from './demo-auth'
import { useToast } from '@/components/ui/toast'
import { DEMO_PASSWORD, users as demoUsers, tenants as demoTenants } from '@/data/fixtures/demo-data'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingrese su correo corporativo.').email('Ingrese un correo válido.'),
  password: z.string().min(1, 'Ingrese su contraseña.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session, signIn } = useSession()
  const repo = useRepository()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (session) return <Navigate to="/" />

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    const result = await authenticateDemo(repo, values.email, values.password)
    if (!result.ok) {
      setFormError('Correo o contraseña no válidos para el modo DEMO.')
      return
    }
    signIn(result.session)
    toast({ title: `Bienvenido, ${result.user.fullName.split(' ')[0]}`, description: 'Sesión DEMO iniciada.' })
    void navigate({ to: search.redirect && search.redirect.startsWith('/') ? search.redirect : '/' })
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <aside className="relative hidden overflow-hidden bg-midnight text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(34,199,242,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(37,99,235,0.35), transparent 45%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">Torre de control del cliente</p>
          <h1 className="mt-4 text-4xl leading-tight font-extrabold tracking-tight">
            Visibilidad completa de cada operación, en un solo lugar.
          </h1>
          <p className="mt-4 text-white/65">
            Siga embarques, documentos, cotizaciones y conversaciones con su equipo de operaciones.
          </p>
        </div>
        <p className="relative text-xs text-white/40">Entorno de demostración con datos sintéticos.</p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo />
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <Globe2 className="size-4" aria-hidden />
            <span className="sr-only">Idioma</span>
            <select aria-label="Idioma" defaultValue="es" className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-3 focus:ring-blue/15">
              <option value="es">Español</option>
              <option value="en" disabled>English (próximamente)</option>
            </select>
          </label>
        </div>

        <div className="m-auto w-full max-w-sm py-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-warning-50 px-3 py-1 text-xs font-semibold text-warning-700 ring-1 ring-amber-200">
            <FlaskConical className="size-3.5" aria-hidden /> MODO DEMO — sin autenticación real
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-ink">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-ink-muted">Acceda con una cuenta de demostración.</p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 flex flex-col gap-5">
            <Field label="Correo corporativo" htmlFor="email" error={errors.email?.message}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="nombre@empresa.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass}
                {...register('email')}
              />
            </Field>

            <Field label="Contraseña" htmlFor="password" error={errors.password?.message} hint={`Contraseña DEMO: ${DEMO_CREDENTIAL_HINT}`}>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  className={`${inputClass} pr-11`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </p>
            )}

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setRecoveryOpen((o) => !o)} aria-expanded={recoveryOpen} className="font-medium text-blue hover:underline">
                ¿Olvidó su contraseña?
              </button>
            </div>
            {recoveryOpen && (
              <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink-soft animate-fade-in">
                En modo DEMO no se envían correos de recuperación. En la versión conectada, este flujo llegará a su correo corporativo.
              </p>
            )}

            <Button type="submit" size="md" loading={isSubmitting} className="h-11 w-full">
              Acceder a la plataforma <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-8">
            <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Cuentas de demostración</p>
            <div className="mt-3 flex flex-col gap-2">
              {demoTenants.map((t) => {
                const sample = demoUsers.find((u) => u.tenantId === t.id)
                if (!sample) return null
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setValue('email', sample.email, { shouldValidate: true })
                      setValue('password', DEMO_PASSWORD, { shouldValidate: true })
                    }}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors duration-200 hover:border-blue hover:bg-blue-50/40"
                  >
                    <LogoMark className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{t.shortName}</span>
                      <span className="block truncate text-xs text-ink-muted">{sample.email}</span>
                    </span>
                    <span className="text-xs font-semibold text-blue">Rellenar</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-ink-muted">
          Logixtic · Portal de clientes · Datos sintéticos, sin conexión a sistemas productivos.
        </p>
      </main>
    </div>
  )
}
