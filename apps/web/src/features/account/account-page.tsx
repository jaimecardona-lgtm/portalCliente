/**
 * Información de la cuenta de la empresa (/cuenta): datos generales, direcciones y contactos.
 *
 * Responsabilidad: presentar datos del tenant activo en modo solo lectura. Los cambios se solicitan
 * mediante el módulo de solicitudes; esta pantalla no modifica datos.
 * Dependencias: useRepository (listTenant, listAddresses, listContacts) y useSession para el tenant.
 * Contrato: no recibe parámetros; todas las consultas incluyen tenantId de la sesión.
 * Errores: si la consulta de empresa falla se muestra ErrorState con reintento.
 */
import { type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Building2, MapPin, Lock, ArrowRight, Mail, Phone } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { Card, ErrorState, SectionHeading, Skeleton } from '@/components/ui/primitives'

export function AccountPage() {
  const repo = useRepository()
  const { session } = useSession()
  const tenantId = session?.tenantId ?? ''

  const tenant = useQuery({ queryKey: tenantKey(tenantId, 'tenant'), queryFn: () => repo.getTenant(tenantId), enabled: Boolean(tenantId) })
  const addresses = useQuery({ queryKey: tenantKey(tenantId, 'addresses'), queryFn: () => repo.listAddresses(tenantId), enabled: Boolean(tenantId) })
  const contacts = useQuery({ queryKey: tenantKey(tenantId, 'contacts'), queryFn: () => repo.listContacts(tenantId), enabled: Boolean(tenantId) })

  if (tenant.isError) return <Card><ErrorState message="No se pudo cargar la información de la cuenta." onRetry={() => void tenant.refetch()} /></Card>

  const t = tenant.data
  const commercial = (contacts.data ?? []).filter((c) => c.kind === 'commercial')
  const operational = (contacts.data ?? []).filter((c) => c.kind === 'operational')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Empresa</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Información de cuenta</h1>
          <p className="mt-1 text-sm text-ink-muted">Consulte los datos registrados de su empresa.</p>
        </div>
      </header>

      <p className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-blue/20 bg-blue-50/60 p-4 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2.5"><Lock className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />Esta información es de solo lectura. Para modificarla, cree una solicitud de cambio de datos.</span>
        <Link to="/solicitudes/nueva" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-blue hover:underline">
          Solicitar un cambio <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionHeading title="Datos generales" />
          {tenant.isPending || !t ? (
            <Skeleton className="h-40" />
          ) : (
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Razón social" value={t.legalName} icon={<Building2 className="size-4" aria-hidden />} />
              <Field label="NIT" value={t.taxId} mono />
              <Field label="País" value={t.country} />
              <Field label="Ciudad" value={t.city} />
              <Field label="Segmento" value={t.segment} />
              <Field label="Gestor de cuenta" value={t.accountManager} />
            </dl>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionHeading title="Direcciones" />
          {addresses.isPending ? (
            <Skeleton className="h-40" />
          ) : (addresses.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-muted">No hay direcciones registradas.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(addresses.data ?? []).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{a.label}</p>
                    <p className="text-sm text-ink-soft">{a.line}</p>
                    <p className="text-xs text-ink-muted">{a.city}, {a.country}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <ContactCard title="Contactos comerciales" contacts={commercial} loading={contacts.isPending} />
        <ContactCard title="Contactos operativos" contacts={operational} loading={contacts.isPending} />
      </div>
    </div>
  )
}

function Field({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 flex items-center gap-1.5 font-medium text-ink ${mono ? 'font-mono text-[13px]' : ''}`}>
        {icon}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  )
}

function ContactCard({
  title,
  contacts,
  loading,
}: {
  title: string
  contacts: Array<{ id: string; fullName: string; role: string; email: string; phone: string }>
  loading: boolean
}) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading title={title} />
      {loading ? (
        <Skeleton className="h-40" />
      ) : contacts.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay contactos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-midnight text-xs font-bold text-cyan" aria-hidden>
                {c.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{c.fullName}</p>
                <p className="text-xs text-ink-muted">{c.role}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-blue"><Mail className="size-3" aria-hidden />{c.email}</a>
                  <span className="inline-flex items-center gap-1 tabular"><Phone className="size-3" aria-hidden />{c.phone}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
