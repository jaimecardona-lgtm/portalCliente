/**
 * Perfil del usuario autenticado (/perfil).
 *
 * Responsabilidad: mostrar la cuenta, editar el nombre y cambiar la contraseña.
 * Dependencias: API local de autenticación (solo desarrollo, cargada con loadLocalAuthApi),
 * repositorio local para reflejar el nombre en la barra superior, y useEndSession para cerrar sesión.
 * Contrato: el nombre es el único campo editable. Empresa y rol se muestran y nunca se envían al servidor.
 * Seguridad: el servidor valida la sesión en cada petición y decide tenant y rol; esta pantalla no es
 * una barrera de autorización. Tras cambiar la contraseña, el servidor cierra las demás sesiones.
 * Decisión no evidente: sin la API local (producción) la pantalla queda sin datos y no intenta leer nada.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Card, Field, ErrorState, SectionHeading, Skeleton, inputClass } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { useOptionalRepository } from '@/services/repositories'
import { useSession } from '@/features/auth/session-context'
import { loadLocalAuthApi } from '@/features/auth/auth-gateway'
import { toDomainUser } from '@/features/auth/account-mapping'
import { PasswordInput } from '@/features/auth/auth-layout'
import { PASSWORD_MIN_LENGTH } from '@/features/auth/password-strength'
import { useEndSession } from '@/features/auth/use-end-session'
import { formatDate, formatDateTime } from '@/lib/format'
import legal from '@/content/legal/legal-meta.json'

const nameSchema = z.object({
  fullName: z.string().trim().min(2, 'Escribe tu nombre completo.').max(120, 'El nombre es demasiado largo.'),
})
type NameValues = z.infer<typeof nameSchema>

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`).max(256),
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Las contraseñas no coinciden.', path: ['confirmPassword'] })
type PasswordValues = z.infer<typeof passwordSchema>

export function ProfilePage() {
  const api = useQuery({
    queryKey: ['local-account'],
    queryFn: async () => {
      const gateway = await loadLocalAuthApi()
      return gateway ? gateway.getSessionAccount() : null
    },
    staleTime: 0,
  })
  const { tenant } = useSession()
  const repo = useOptionalRepository()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const endSession = useEndSession()
  const [nameError, setNameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const nameForm = useForm<NameValues>({ resolver: zodResolver(nameSchema), values: { fullName: api.data?.fullName ?? '' } })
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })

  if (api.isError) {
    return <Card><ErrorState message="No pudimos cargar tu perfil." onRetry={() => void api.refetch()} /></Card>
  }

  if (api.isPending) {
    return <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-72" /></div>
  }

  const account = api.data
  if (!account) {
    return (
      <Card className="p-8 text-center">
        <p className="font-semibold text-ink">No hay una sesión activa.</p>
        <Button className="mt-4" onClick={() => endSession()}>Ir a iniciar sesión</Button>
      </Card>
    )
  }

  const saveName = async (values: NameValues) => {
    setNameError(null)
    const gateway = await loadLocalAuthApi()
    if (!gateway) return
    const result = await gateway.updateName(values.fullName)
    if (result.status === 'ok') {
      await repo?.replaceUser?.(toDomainUser(result.user))
      await queryClient.invalidateQueries({ queryKey: ['identity'] })
      await queryClient.invalidateQueries({ queryKey: ['local-account'] })
      toast({ title: 'Nombre actualizado' })
      return
    }
    if (result.status === 'invalid') {
      nameForm.setError('fullName', { message: result.message ?? 'Revisa el nombre.' })
      return
    }
    setNameError('No fue posible guardar el nombre. Inténtalo de nuevo.')
  }

  const savePassword = async (values: PasswordValues) => {
    setPasswordError(null)
    const gateway = await loadLocalAuthApi()
    if (!gateway) return
    const result = await gateway.changePassword(values.currentPassword, values.newPassword)
    if (result.status === 'ok') {
      passwordForm.reset()
      toast({ title: 'Contraseña actualizada', description: 'Las demás sesiones abiertas se cerraron.' })
      return
    }
    if (result.status === 'wrong_password') {
      passwordForm.setError('currentPassword', { message: 'La contraseña actual no es correcta.' })
      return
    }
    if (result.status === 'invalid') {
      if (result.field === 'newPassword') passwordForm.setError('newPassword', { message: result.message ?? 'Revisa la contraseña.' })
      else setPasswordError(result.message ?? 'Revisa los datos.')
      return
    }
    setPasswordError('No fue posible cambiar la contraseña. Inténtalo de nuevo.')
  }

  const newPassword = passwordForm.watch('newPassword')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Cuenta personal</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Mi perfil</h1>
          <p className="mt-1 text-sm text-ink-muted">Consulta y actualiza tus datos básicos y tu contraseña.</p>
        </div>
        <Button variant="secondary" onClick={() => endSession()}>
          <LogOut className="size-4" aria-hidden /> Cerrar sesión
        </Button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <SectionHeading title="Datos de la cuenta" description="La empresa y el rol los asigna Logixtic." />
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-3 rounded-xl bg-canvas p-3.5">
              <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-cyan to-blue text-white" aria-hidden><UserRound className="size-5" /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{account.fullName}</p>
                <p className="truncate text-xs text-ink-muted">{account.email}</p>
              </div>
            </div>
            <div><dt className="text-xs text-ink-muted">Empresa asignada</dt><dd className="font-medium text-ink">{tenant?.legalName ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-muted">Rol</dt><dd><Badge tone="brand">Cliente</Badge></dd></div>
            <div><dt className="text-xs text-ink-muted">Cuenta creada</dt><dd className="font-medium tabular text-ink">{formatDate(account.createdAt.slice(0, 10))}</dd></div>
            <div><dt className="text-xs text-ink-muted">Último acceso</dt><dd className="font-medium tabular text-ink">{formatDateTime(account.lastLoginAt)}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-muted">Términos aceptados</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink-soft">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Versión {account.termsVersionAccepted ?? legal.version} · {formatDateTime(account.termsAcceptedAt)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5 sm:p-6">
            <SectionHeading title="Editar nombre" />
            <form onSubmit={nameForm.handleSubmit(saveName)} noValidate className="flex flex-col gap-4">
              <Field label="Nombre completo" htmlFor="profile-name" error={nameForm.formState.errors.fullName?.message}>
                <input id="profile-name" autoComplete="name" aria-invalid={Boolean(nameForm.formState.errors.fullName)} className={inputClass} {...nameForm.register('fullName')} />
              </Field>
              {nameError && <p role="alert" className="text-sm text-danger-700">{nameError}</p>}
              <div className="flex justify-end">
                <Button type="submit" loading={nameForm.formState.isSubmitting}>Guardar nombre</Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionHeading title="Cambiar contraseña" description="Al cambiarla, cerraremos tus otras sesiones abiertas." />
            <form onSubmit={passwordForm.handleSubmit(savePassword)} noValidate className="flex flex-col gap-4">
              <PasswordInput
                id="current-password"
                label="Contraseña actual"
                autoComplete="current-password"
                error={passwordForm.formState.errors.currentPassword?.message}
                registration={passwordForm.register('currentPassword')}
              />
              <PasswordInput
                id="new-password"
                label="Nueva contraseña"
                autoComplete="new-password"
                hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Recomendado: 12 o más.`}
                error={passwordForm.formState.errors.newPassword?.message}
                registration={passwordForm.register('newPassword')}
                showStrength
                value={newPassword}
              />
              <PasswordInput
                id="confirm-password"
                label="Confirmar nueva contraseña"
                autoComplete="new-password"
                error={passwordForm.formState.errors.confirmPassword?.message}
                registration={passwordForm.register('confirmPassword')}
              />
              {passwordError && <p role="alert" className="text-sm text-danger-700">{passwordError}</p>}
              <div className="flex justify-end">
                <Button type="submit" loading={passwordForm.formState.isSubmitting}>Actualizar contraseña</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
