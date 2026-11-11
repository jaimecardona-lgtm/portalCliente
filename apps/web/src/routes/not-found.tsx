import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-midnight text-cyan">
          <Compass className="size-7" aria-hidden />
        </div>
        <p className="text-xs font-semibold tracking-[0.16em] text-blue uppercase">Error 404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Esta página no existe</h1>
        <p className="mt-2 text-sm text-ink-muted">Puede que el enlace esté incompleto o que la sección aún no esté disponible.</p>
        <Link to="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-blue px-4 text-sm font-medium text-white hover:bg-blue-600">
          Volver a la torre de control
        </Link>
        <div className="mt-10 flex justify-center opacity-60">
          <div className="rounded-xl bg-midnight px-4 py-3"><Logo compact={false} /></div>
        </div>
      </div>
    </main>
  )
}
