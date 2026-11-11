import { useState, type ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { Eye, EyeOff, FileText, FolderArchive, Package, Route, ShieldCheck } from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { Field, inputClass } from '@/components/ui/primitives'
import { passwordStrength } from './password-strength'
import { cn } from '@/lib/format'

/** Diseño de dos columnas para las pantallas públicas de acceso (login, registro, recuperación). */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-midnight text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, rgba(34,199,242,0.22), transparent 42%), radial-gradient(circle at 85% 80%, rgba(37,99,235,0.28), transparent 48%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
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
              { icon: ShieldCheck, label: 'Acceso protegido por cuenta personal' },
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

      <main className="flex min-h-dvh flex-col bg-canvas px-5 py-8 sm:px-10 lg:bg-surface lg:px-16">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="m-auto w-full max-w-[440px] py-10">
          <div className="mb-8 lg:hidden">
            <LogoMark className="size-11" />
          </div>
          {children}
        </div>
        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs text-ink-muted lg:justify-start">
          {footer ?? <span>Logixtic · Portal de clientes</span>}
          <Link to="/terminos" className="hover:text-blue hover:underline">Términos y condiciones</Link>
          <Link to="/privacidad" className="hover:text-blue hover:underline">Política de privacidad</Link>
        </footer>
      </main>
    </div>
  )
}

/** Campo de contraseña con mostrar/ocultar, accesible y con descripción de la regla. */
export function PasswordInput({
  id,
  label,
  error,
  hint,
  autoComplete,
  disabled,
  registration,
  showStrength = false,
  value,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  autoComplete: string
  disabled?: boolean
  registration: UseFormRegisterReturn
  showStrength?: boolean
  value?: string
}) {
  const [visible, setVisible] = useState(false)
  const strength = showStrength ? passwordStrength(value ?? '') : null
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={`${inputClass} pr-11`}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition-colors duration-200 hover:bg-surface-muted hover:text-ink disabled:opacity-40"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {strength && value && (
        <div className="mt-1" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', i < strength.score ? strength.color : 'bg-line')} />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Seguridad: <span className="font-semibold text-ink-soft">{strength.label}</span></p>
        </div>
      )}
    </Field>
  )
}
