import { Link } from '@tanstack/react-router'
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { LogoMark, Logo } from '@/components/brand/logo'
import legal from '@/content/legal/legal-meta.json'
import { PRIVACY_SECTIONS, TERMS_SECTIONS, type LegalSection } from '@/content/legal/legal-content'

function LegalLayout({ title, icon: Icon, intro, sections, backTo, extra }: { title: string; icon: typeof FileText; intro: string; sections: LegalSection[]; backTo: { to: string; label: string }; extra?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
          <Logo compact />
          <Link to={backTo.to} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-blue">
            <ArrowLeft className="size-4" aria-hidden /> {backTo.label}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="rounded-[18px] bg-midnight p-7 text-white shadow-pop sm:p-10">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-cyan">
              <Icon className="size-5" aria-hidden />
            </span>
            <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">Logixtic · Documento legal</p>
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/70">{intro}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
              <dt className="text-xs text-white/50">Versión</dt>
              <dd className="font-semibold tabular">{legal.version}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
              <dt className="text-xs text-white/50">Estado</dt>
              <dd className="font-semibold">{legal.estado}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
              <dt className="text-xs text-white/50">Vigente desde</dt>
              <dd className="font-semibold">{legal.vigenteDesde}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <article className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card sm:p-10">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 border-b border-line py-7 first:pt-0 last:border-b-0 last:pb-0">
                <h2 className="text-lg font-semibold tracking-tight text-ink">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">
                  {section.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
            {extra}
          </article>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Índice del documento" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Índice</p>
              <ul className="mt-3 space-y-2 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-ink-soft hover:text-blue">{s.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="rounded-[var(--radius-card)] border border-warning/40 bg-warning-50 p-5 text-sm text-warning-700">
              <p className="font-semibold">Pendiente de revisión jurídica</p>
              <p className="mt-2 leading-relaxed">
                Este texto es un borrador estructurado. No constituye una política aprobada hasta que Logixtic lo valide.
              </p>
            </div>
            <LogoMark className="mx-auto mt-2 size-9 opacity-60" />
          </aside>
        </div>
      </main>
    </div>
  )
}

export function TermsPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      icon={FileText}
      intro="Condiciones de uso del Portal de Clientes de Logixtic: alcance, responsabilidades de las cuentas, información operacional y disponibilidad."
      sections={TERMS_SECTIONS}
      backTo={{ to: '/login', label: 'Volver al acceso' }}
    />
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      icon={ShieldCheck}
      intro="Cómo Logixtic trata los datos personales de quienes usan el portal: finalidades, categorías de datos, derechos y seguridad."
      sections={PRIVACY_SECTIONS}
      extra={
        <section className="mt-7 rounded-xl border border-warning/40 bg-warning-50 p-5 text-sm text-warning-700">
          <h2 className="font-semibold">Datos del responsable (pendientes de aprobación)</h2>
          <ul className="mt-2 space-y-1">
            <li>Razón social: {legal.responsable.razonSocial}</li>
            <li>NIT: {legal.responsable.nit}</li>
            <li>Dirección: {legal.responsable.direccion}</li>
            <li>Correo de contacto: {legal.responsable.correoContacto}</li>
            <li>Plazos de conservación: {legal.plazosConservacion}</li>
          </ul>
        </section>
      }
      backTo={{ to: '/login', label: 'Volver al acceso' }}
    />
  )
}
