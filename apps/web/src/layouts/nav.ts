import {
  LayoutDashboard,
  Package,
  FolderArchive,
  FileText,
  MessageSquarePlus,
  Building2,
  Store,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Marketplace: solo visual, sin acciones. */
  futureOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Control',
    items: [{ to: '/', label: 'Torre de control', icon: LayoutDashboard }],
  },
  {
    label: 'Operación',
    items: [
      { to: '/operaciones', label: 'Operaciones', icon: Package },
      { to: '/documentos', label: 'Documentos', icon: FolderArchive },
      { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
      { to: '/solicitudes', label: 'Solicitudes', icon: MessageSquarePlus },
    ],
  },
  {
    label: 'Empresa',
    items: [
      { to: '/cuenta', label: 'Información de cuenta', icon: Building2 },
      { to: '/marketplace', label: 'Marketplace', icon: Store, futureOnly: true },
    ],
  },
]

/** Etiquetas de migas por primer segmento de ruta. */
export const SECTION_LABELS: Record<string, string> = {
  operaciones: 'Operaciones',
  documentos: 'Documentos',
  cotizaciones: 'Cotizaciones',
  solicitudes: 'Solicitudes',
  cuenta: 'Información de cuenta',
  perfil: 'Mi perfil',
  registro: 'Crear cuenta',
  terminos: 'Términos y condiciones',
  privacidad: 'Política de privacidad',
  marketplace: 'Marketplace',
  nueva: 'Nueva solicitud',
  soporte: 'Panel de soporte',
}

/**
 * Navegación del personal interno. Mismo layout que el cliente; el panel de soporte es la entrada.
 * Las vistas de empresa quedan visibles pero no cargan datos hasta que haya un contexto autorizado: la pantalla
 * explica el estado en lugar de mostrar datos de ejemplo o ceros.
 */
export const STAFF_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Soporte',
    items: [{ to: '/soporte', label: 'Panel de soporte', icon: ShieldCheck }],
  },
  {
    label: 'Empresa',
    items: [
      { to: '/operaciones', label: 'Operaciones', icon: Package },
      { to: '/documentos', label: 'Documentos', icon: FolderArchive },
      { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
      { to: '/solicitudes', label: 'Solicitudes', icon: MessageSquarePlus },
    ],
  },
]

/** Nombre visible de los roles internos. Un rol desconocido no se muestra tal cual. */
export const STAFF_ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Administrador de plataforma',
  qa: 'QA',
  developer: 'Desarrollo',
  support: 'Soporte',
}
