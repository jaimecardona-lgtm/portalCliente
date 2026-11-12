import {
  LayoutDashboard,
  Package,
  FolderArchive,
  FileText,
  MessageSquarePlus,
  Building2,
  Store,
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
}
