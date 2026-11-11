import { useState } from 'react'
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ShieldAlert, ArrowRight, Package, FileText, FolderArchive, Route } from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { Button, Field, inputClass } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { LOCAL_ACCESS_ENABLED } from '@/config/runtime'
import { useOptionalRepository } from '@/services/repositories'
import { useSession } from './session-context'
import { authenticateDemo } from './local-auth'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingresa tu correo corporativo.').email('Ingresa un correo válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
})

type LoginValues = z.infer<typeof loginSchema>

/** Texto neutro para usuarios: no revela detalles de configuración técnica. */
const ACCESS_UNAVAILABLE_MESSAGE = 'El acceso a Logixtic no está disponible en este momento. Contacta a tu ejecutivo de cuenta.'

export function LoginPage() {
  const { session, signIn } = useSession()
  const repo = useOptionalRepository()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const canSubmit = LOCAL_ACCESS_ENABLED && repo !== null

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (session && LOCAL_ACCESS_ENABLED) return <Navigate to="/" />

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    if (!canSubmit || !repo) {
      setFormError(ACCESS_UNAVAILABLE_MESSAGE)
      return
    }
    const result = await authenticateDemo(repo, values.email, values.password)
    if (!result.ok) {
      setFormError('Correo o contraseña no válidos.')
      return
    }
    signIn(result.session)
    toast({ title: `Bienvenido, ${result.user.fullName.split(' ')[0]}` })
    void navigate({ to: search.redirect && search.redirect.startsWith('/') ? search.redirect : '/' })
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Panel de marca */}
      <aside className="relative hidden overflow-hidden bg-midnight text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, rgba(34,199,242,0.22), transparent 42%), radial-gradient(circle at 85% 80%, rgba(37,99,235,0.28), transparent 48%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div aria-hidden className="pointer-events-none absolute right-[-120px] bottom-[-120px] size-[420px] rounded-full border border-cyan/10" />
        <div aria-hidden className="pointer-events-none absolute right-[-40px] bottom-[-40px] size-[260px] rounded-full border border-cyan/15" />

        <div className="relative">
          <Logo />
        </div>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">Portal de clientes</p>
          <h2 className="mt-4 text-4xl leading-[1.15] font-extrabold tracking-tight">Tu operación logística, siempre bajo control.</h2>
          <p className="mt-5 text-base leading-relaxed text-white/70">
            Consulta embarques, gestiona documentos, revisa cotizaciones y mantente conectado con tu equipo logístico.
          </p>

          <ul className="mt-10 grid gap-3">
            {[
              { icon: Package, label: 'Operaciones y embarques' },
              { icon: FolderArchive, label: 'Documentos y vigencias' },
              { icon: FileText, label: 'Cotizaciones y condiciones' },
              { icon: Route, label: 'Conversación por evento de cada operación' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/80">
                <span className="grid size-8 place-items-center rounded-lg bg-white/[0.07] ring-1 ring-white/10">
                  <Icon className="size-4 text-cyan" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">© Logixtic. Todos los derechos reservados.</p>
      </aside>

      {/* Formulario */}
      <main className="flex min-h-dvh flex-col bg-canvas px-5 py-8 sm:px-10 lg:bg-surface lg:px-16">
        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="m-auto w-full max-w-[420px] py-10">
          <div className="mb-8 lg:hidden">
            <LogoMark className="size-11" />
          </div>

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
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass}
                {...register('email')}
              />
            </Field>

            <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={!canSubmit}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`${inputClass} pr-11`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  disabled={!canSubmit}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition-colors duration-200 hover:bg-surface-muted hover:text-ink focus-visible:outline-2 disabled:opacity-40"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </Field>

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
        </div>

        <p className="text-center text-xs text-ink-muted lg:text-left">
          Logixtic · Portal de clientes
        </p>
      </main>
    </div>
  )
}
