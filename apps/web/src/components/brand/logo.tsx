import { cn } from '@/lib/format'

/**
 * Marca Logixtic. Representación tipográfica + símbolo geométrico propio.
 * No reproduce un logotipo oficial: sustituir por el activo de marca aprobado cuando esté disponible.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id="lx-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22C7F2" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lx-grad)" />
      <path d="M9 9h4.2v10.4H21V23H9z" fill="#091629" />
      <circle cx="22.5" cy="9.5" r="2.2" fill="#091629" />
    </svg>
  )
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <div className="leading-none">
          <p className="text-[17px] font-extrabold tracking-tight text-white">
            Logix<span className="text-cyan">tic</span>
          </p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-white/50 uppercase">Portal de clientes</p>
        </div>
      )}
    </div>
  )
}
