/**
 * Marca Logixtic: logotipo e isotipo (X).
 *
 * Responsabilidad: mostrar los recursos OFICIALES de la marca. Nunca dibuja una X ni un logotipo propio.
 * Recursos esperados (no incluidos en el repositorio; ver apps/web/public/brand/README.md):
 *   - /brand/logixtic-logo-negativo.svg   (wordmark negativo: fondos Azul Noche o negro)
 *   - /brand/logixtic-logo-principal.svg  (wordmark azul: solo sobre blanco o negro puro)
 *   - /brand/logixtic-isotipo.svg         (X oficial: favicon, avatar, iconos)
 *
 * Mientras falten los recursos:
 *   - El isotipo no se muestra (no se sustituye por otra forma).
 *   - El logotipo muestra el nombre "Logixtic" en texto plano, marcado como provisional con
 *     data-brand-asset="pending". Es un marcador de texto, no el logotipo: sustituir al recibir el recurso.
 *
 * Accesibilidad: la imagen lleva texto alternativo "Logixtic"; el isotipo es decorativo (aria-hidden).
 */
import { useState } from 'react'
import { cn } from '@/lib/format'

export const BRAND_ASSETS = {
  wordmarkNegative: '/brand/logixtic-logo-negativo.svg',
  wordmarkPrimary: '/brand/logixtic-logo-principal.svg',
  isotipo: '/brand/logixtic-isotipo.svg',
} as const

export type WordmarkVariant = 'negative' | 'primary'

/** Isotipo oficial (X). Si el recurso no existe, no se muestra nada. */
export function LogoMark({ className }: { className?: string }) {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return (
    <img
      src={BRAND_ASSETS.isotipo}
      alt=""
      aria-hidden
      width={32}
      height={32}
      className={cn('size-8 shrink-0', className)}
      onError={() => setMissing(true)}
    />
  )
}

/** Logotipo oficial. Versión negativa sobre Azul Noche, versión azul sobre blanco. */
export function Wordmark({ variant = 'negative', className }: { variant?: WordmarkVariant; className?: string }) {
  const [missing, setMissing] = useState(false)
  const src = variant === 'negative' ? BRAND_ASSETS.wordmarkNegative : BRAND_ASSETS.wordmarkPrimary
  if (missing) {
    return (
      <span
        data-brand-asset="pending"
        className={cn(
          'font-display text-[17px] font-bold tracking-tight',
          variant === 'negative' ? 'text-white' : 'text-navy',
          className,
        )}
      >
        Logixtic
      </span>
    )
  }
  return (
    <img
      src={src}
      alt="Logixtic"
      className={cn('h-8 w-auto', className)}
      onError={() => setMissing(true)}
    />
  )
}

/** Logotipo con la etiqueta de producto. `compact` oculta la etiqueta. */
export function Logo({
  compact = false,
  variant = 'negative',
  className,
}: {
  compact?: boolean
  variant?: WordmarkVariant
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Wordmark variant={variant} />
      {!compact && (
        <p
          className={cn(
            'border-l pl-3 text-[10px] font-semibold tracking-[0.18em] uppercase',
            variant === 'negative' ? 'border-white/20 text-white/70' : 'border-line-strong text-ink-muted',
          )}
        >
          Portal de clientes
        </p>
      )}
    </div>
  )
}
