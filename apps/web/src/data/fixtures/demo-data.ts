import { LOCAL_REFERENCE_ISO } from '@/lib/clock'
import type {
  Address,
  Attachment,
  Contact,
  DocumentRecord,
  EventComment,
  Operation,
  OperationEvent,
  Quote,
  Request,
  Tenant,
  User,
} from '@/types/domain'

/**
 * DATOS DEMO SINTÉTICOS.
 * Empresas, personas, números y documentos son ficticios. No representan clientes reales.
 * La contraseña DEMO es única y solo sirve para el modo de demostración local.
 */

export const DEMO_PASSWORD = 'Demo-2026'

/** Fecha de referencia de los datos sintéticos (coherente con los fixtures). */
export const DEMO_NOW = LOCAL_REFERENCE_ISO

export const tenants: Tenant[] = [
  {
    id: 'tn-andino',
    legalName: 'Textiles Andinos S.A.S.',
    shortName: 'Textiles Andinos',
    taxId: '900.000.001-1',
    country: 'Colombia',
    city: 'Bogotá D.C.',
    segment: 'Manufactura · Textil',
    accountManager: 'Mariana Rojas',
    accent: '#2563EB',
  },
  {
    id: 'tn-pacifico',
    legalName: 'Agroexport Pacífico Ltda.',
    shortName: 'Agroexport Pacífico',
    taxId: '900.000.002-2',
    country: 'Colombia',
    city: 'Cali',
    segment: 'Agroexportación',
    accountManager: 'Sebastián Gil',
    accent: '#10B981',
  },
]

export const users: User[] = [
  {
    id: 'us-ana',
    tenantId: 'tn-andino',
    fullName: 'Ana Lucía Torres',
    email: 'ana.torres@textilesandinos.example',
    role: 'Administrador',
    demoPassword: DEMO_PASSWORD,
  },
  {
    id: 'us-luis',
    tenantId: 'tn-andino',
    fullName: 'Luis Felipe Mora',
    email: 'luis.mora@textilesandinos.example',
    role: 'Operativo',
    demoPassword: DEMO_PASSWORD,
  },
  {
    id: 'us-carla',
    tenantId: 'tn-pacifico',
    fullName: 'Carla Niño',
    email: 'carla.nino@agroexport-pacifico.example',
    role: 'Administrador',
    demoPassword: DEMO_PASSWORD,
  },
  {
    id: 'us-diego',
    tenantId: 'tn-pacifico',
    fullName: 'Diego Restrepo',
    email: 'diego.restrepo@agroexport-pacifico.example',
    role: 'Comercial',
    demoPassword: DEMO_PASSWORD,
  },
]

export const addresses: Address[] = [
  { id: 'ad-1', tenantId: 'tn-andino', label: 'Planta principal', line: 'Calle 80 # 45-12, Zona Industrial', city: 'Bogotá D.C.', country: 'Colombia' },
  { id: 'ad-2', tenantId: 'tn-andino', label: 'Bodega de consolidación', line: 'Km 3 vía Funza, Bodega 7', city: 'Funza', country: 'Colombia' },
  { id: 'ad-3', tenantId: 'tn-pacifico', label: 'Oficina comercial', line: 'Av. 6N # 28-40, Oficina 504', city: 'Cali', country: 'Colombia' },
  { id: 'ad-4', tenantId: 'tn-pacifico', label: 'Empacadora', line: 'Vía Buenaventura km 14, Bodega 2', city: 'Dagua', country: 'Colombia' },
]

export const contacts: Contact[] = [
  { id: 'ct-1', tenantId: 'tn-andino', fullName: 'Mariana Rojas', role: 'Ejecutiva de cuenta', email: 'mrojas@logixtic.demo.test', phone: '+57 601 000 0101', kind: 'commercial' },
  { id: 'ct-2', tenantId: 'tn-andino', fullName: 'Ana Lucía Torres', role: 'Gerente de comercio exterior', email: 'ana.torres@textilesandinos.example', phone: '+57 310 000 0101', kind: 'commercial' },
  { id: 'ct-3', tenantId: 'tn-andino', fullName: 'Jorge Peña', role: 'Coordinador de operaciones', email: 'jpena@logixtic.demo.test', phone: '+57 601 000 0102', kind: 'operational' },
  { id: 'ct-4', tenantId: 'tn-andino', fullName: 'Luis Felipe Mora', role: 'Analista de logística', email: 'luis.mora@textilesandinos.example', phone: '+57 310 000 0102', kind: 'operational' },
  { id: 'ct-5', tenantId: 'tn-pacifico', fullName: 'Sebastián Gil', role: 'Ejecutivo de cuenta', email: 'sgil@logixtic.demo.test', phone: '+57 602 000 0201', kind: 'commercial' },
  { id: 'ct-6', tenantId: 'tn-pacifico', fullName: 'Carla Niño', role: 'Directora de exportaciones', email: 'carla.nino@agroexport-pacifico.example', phone: '+57 315 000 0201', kind: 'commercial' },
  { id: 'ct-7', tenantId: 'tn-pacifico', fullName: 'Andrea Vélez', role: 'Coordinadora de embarques', email: 'avelez@logixtic.demo.test', phone: '+57 602 000 0202', kind: 'operational' },
]

export const attachments: Attachment[] = [
  { id: 'at-1', tenantId: 'tn-andino', name: 'Bill_of_Lading_DO-26-0412.pdf', sizeKb: 642, mimeType: 'application/pdf', uploadedAt: '2026-10-19T14:20:00-05:00', uploadedBy: 'us-ana' },
  { id: 'at-2', tenantId: 'tn-andino', name: 'Factura_comercial_INV-5521.pdf', sizeKb: 311, mimeType: 'application/pdf', uploadedAt: '2026-10-18T10:05:00-05:00', uploadedBy: 'us-ana' },
  { id: 'at-3', tenantId: 'tn-andino', name: 'Declaracion_importacion_borrador.pdf', sizeKb: 880, mimeType: 'application/pdf', uploadedAt: '2026-11-06T16:42:00-05:00', uploadedBy: 'us-luis' },
  { id: 'at-4', tenantId: 'tn-andino', name: 'RUT_2026.pdf', sizeKb: 220, mimeType: 'application/pdf', uploadedAt: '2026-01-15T09:00:00-05:00', uploadedBy: 'us-ana' },
  { id: 'at-5', tenantId: 'tn-andino', name: 'Camara_comercio_vigente.pdf', sizeKb: 190, mimeType: 'application/pdf', uploadedAt: '2026-09-02T11:00:00-05:00', uploadedBy: 'us-ana' },
  { id: 'at-6', tenantId: 'tn-pacifico', name: 'Certificado_fitosanitario_ICA.pdf', sizeKb: 455, mimeType: 'application/pdf', uploadedAt: '2026-11-03T08:30:00-05:00', uploadedBy: 'us-carla' },
  { id: 'at-7', tenantId: 'tn-pacifico', name: 'Packing_list_DO-26-0408.xlsx', sizeKb: 128, mimeType: 'application/vnd.ms-excel', uploadedAt: '2026-11-08T17:10:00-05:00', uploadedBy: 'us-diego' },
  { id: 'at-8', tenantId: 'tn-pacifico', name: 'Poliza_seguro_2026.pdf', sizeKb: 402, mimeType: 'application/pdf', uploadedAt: '2025-12-01T09:00:00-05:00', uploadedBy: 'us-carla' },
]

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export const operations: Operation[] = [
  {
    id: 'op-0412', tenantId: 'tn-andino', doNumber: 'DO-26-0412', reference: 'TA-IMP-0412 · Hilos de poliéster',
    status: 'En tránsito', kind: 'Importación', transport: 'Marítimo FCL', owner: 'Jorge Peña',
    ordenNumber: 'OC-7781', booking: 'BKG-88412', origin: 'Shanghái (CNSHA)', destination: 'Cartagena (COCTG)',
    etd: '2026-10-18', eta: '2026-11-24', atd: '2026-10-19', ata: null, freeDays: 14, documentClosingDate: '2026-11-28',
    createdAt: '2026-10-05', updatedAt: '2026-11-10', pendingClientResponse: false,
  },
  {
    id: 'op-0398', tenantId: 'tn-andino', doNumber: 'DO-26-0398', reference: 'TA-IMP-0398 · Maquinaria de tejido',
    status: 'En aduana', kind: 'Importación', transport: 'Marítimo FCL', owner: 'Andrea Vélez',
    ordenNumber: 'OC-7702', booking: 'BKG-87901', origin: 'Hamburgo (DEHAM)', destination: 'Cartagena (COCTG)',
    etd: '2026-10-01', eta: '2026-11-05', atd: '2026-10-02', ata: '2026-11-06', freeDays: 7, documentClosingDate: '2026-11-15',
    createdAt: '2026-09-22', updatedAt: '2026-11-07', pendingClientResponse: true,
  },
  {
    id: 'op-0433', tenantId: 'tn-andino', doNumber: 'DO-26-0433', reference: 'TA-EXP-0433 · Muestras textiles',
    status: 'En puerto', kind: 'Exportación', transport: 'Marítimo LCL', owner: 'Jorge Peña',
    ordenNumber: 'OC-7810', booking: 'BKG-88590', origin: 'Cartagena (COCTG)', destination: 'Rotterdam (NLRTM)',
    etd: '2026-11-12', eta: '2026-12-02', atd: null, ata: null, freeDays: 5, documentClosingDate: '2026-11-13',
    createdAt: '2026-11-02', updatedAt: '2026-11-10', pendingClientResponse: true,
  },
  {
    id: 'op-0421', tenantId: 'tn-andino', doNumber: 'DO-26-0421', reference: 'TA-IMP-0421 · Insumos de tintorería',
    status: 'Creado', kind: 'Importación', transport: 'Marítimo LCL', owner: 'Luis Felipe Mora',
    ordenNumber: 'OC-7833', booking: 'Pendiente', origin: 'Ningbo (CNNGB)', destination: 'Cartagena (COCTG)',
    etd: '2026-11-20', eta: '2026-12-18', atd: null, ata: null, freeDays: null, documentClosingDate: null,
    createdAt: '2026-11-08', updatedAt: '2026-11-08', pendingClientResponse: false,
  },
  {
    id: 'op-0377', tenantId: 'tn-andino', doNumber: 'DO-26-0377', reference: 'TA-EXP-0377 · Telas técnicas',
    status: 'Entregado', kind: 'Exportación', transport: 'Aéreo', owner: 'Andrea Vélez',
    ordenNumber: 'OC-7650', booking: 'AWB-145-2290', origin: 'Bogotá (BOG)', destination: 'Miami (MIA)',
    etd: '2026-10-02', eta: '2026-10-03', atd: '2026-10-02', ata: '2026-10-03', freeDays: null, documentClosingDate: '2026-10-08',
    createdAt: '2026-09-28', updatedAt: '2026-10-04', pendingClientResponse: false,
  },
  {
    id: 'op-0355', tenantId: 'tn-andino', doNumber: 'DO-26-0355', reference: 'TA-NAC-0355 · Algodón nacionalizado',
    status: 'Cerrado', kind: 'Nacionalización', transport: 'Terrestre', owner: 'Jorge Peña',
    ordenNumber: 'OC-7512', booking: 'TRK-3340', origin: 'Maicao (CO)', destination: 'Funza (CO)',
    etd: '2026-08-14', eta: '2026-08-16', atd: '2026-08-14', ata: '2026-08-16', freeDays: null, documentClosingDate: '2026-08-20',
    createdAt: '2026-08-10', updatedAt: '2026-08-25', pendingClientResponse: false,
  },
  {
    id: 'op-0408', tenantId: 'tn-pacifico', doNumber: 'DO-26-0408', reference: 'AP-EXP-0408 · Aguacate Hass',
    status: 'En puerto', kind: 'Exportación', transport: 'Marítimo FCL', owner: 'Andrea Vélez',
    ordenNumber: 'OC-P-3301', booking: 'BKG-90112', origin: 'Buenaventura (COBUN)', destination: 'Rotterdam (NLRTM)',
    etd: '2026-11-13', eta: '2026-12-04', atd: null, ata: null, freeDays: 4, documentClosingDate: '2026-11-12',
    createdAt: '2026-10-28', updatedAt: '2026-11-10', pendingClientResponse: true,
  },
  {
    id: 'op-0391', tenantId: 'tn-pacifico', doNumber: 'DO-26-0391', reference: 'AP-EXP-0391 · Banano orgánico',
    status: 'En tránsito', kind: 'Exportación', transport: 'Marítimo FCL', owner: 'Andrea Vélez',
    ordenNumber: 'OC-P-3288', booking: 'BKG-89744', origin: 'Buenaventura (COBUN)', destination: 'Hamburgo (DEHAM)',
    etd: '2026-10-25', eta: '2026-11-22', atd: '2026-10-26', ata: null, freeDays: null, documentClosingDate: '2026-11-18',
    createdAt: '2026-10-10', updatedAt: '2026-11-09', pendingClientResponse: false,
  },
  {
    id: 'op-0444', tenantId: 'tn-pacifico', doNumber: 'DO-26-0444', reference: 'AP-IMP-0444 · Empaques y cajas',
    status: 'Pendiente cliente', kind: 'Importación', transport: 'Marítimo LCL', owner: 'Andrea Vélez',
    ordenNumber: 'OC-P-3350', booking: 'BKG-90401', origin: 'Shenzhen (CNSZX)', destination: 'Buenaventura (COBUN)',
    etd: '2026-10-30', eta: '2026-11-27', atd: '2026-10-31', ata: null, freeDays: 10, documentClosingDate: '2026-11-25',
    createdAt: '2026-10-15', updatedAt: '2026-11-10', pendingClientResponse: true,
  },
  {
    id: 'op-0360', tenantId: 'tn-pacifico', doNumber: 'DO-26-0360', reference: 'AP-EXP-0360 · Flores de corte',
    status: 'Cerrado', kind: 'Exportación', transport: 'Aéreo', owner: 'Andrea Vélez',
    ordenNumber: 'OC-P-3190', booking: 'AWB-145-7712', origin: 'Cali (CLO)', destination: 'Miami (MIA)',
    etd: '2026-08-03', eta: '2026-08-04', atd: '2026-08-03', ata: '2026-08-04', freeDays: null, documentClosingDate: '2026-08-09',
    createdAt: '2026-07-29', updatedAt: '2026-08-10', pendingClientResponse: false,
  },
]

// ---------------------------------------------------------------------------
// Eventos del timeline (cada evento tiene su propio hilo de comentarios)
// ---------------------------------------------------------------------------

function ev(partial: Partial<OperationEvent> & Pick<OperationEvent, 'id' | 'tenantId' | 'operationId' | 'type' | 'occurredAt' | 'title'>): OperationEvent {
  return {
    author: 'Logixtic Operaciones',
    authorId: null,
    description: '',
    fromStatus: null,
    toStatus: null,
    visibility: 'client',
    attachmentIds: [],
    ...partial,
  }
}

export const operationEvents: OperationEvent[] = [
  // DO-26-0412
  ev({ id: 'ev-0412-1', tenantId: 'tn-andino', operationId: 'op-0412', type: 'status_change', occurredAt: '2026-10-05T09:00:00-05:00', title: 'Operación creada', description: 'Se registró la DO con la orden de compra OC-7781 y la reserva BKG-88412.', author: 'Jorge Peña', authorId: null, fromStatus: null, toStatus: 'Creado' }),
  ev({ id: 'ev-0412-2', tenantId: 'tn-andino', operationId: 'op-0412', type: 'document', occurredAt: '2026-10-18T14:20:00-05:00', title: 'Documento recibido: factura comercial', description: 'El proveedor entregó la factura comercial INV-5521. Documento asociado a la operación.', author: 'Jorge Peña', attachmentIds: ['at-2'] }),
  ev({ id: 'ev-0412-3', tenantId: 'tn-andino', operationId: 'op-0412', type: 'status_change', occurredAt: '2026-10-19T08:10:00-05:00', title: 'Zarpe confirmado', description: 'El buque zarpó de Shanghái con ATD 19-oct. Documento de embarque disponible.', author: 'Andrea Vélez', fromStatus: 'Creado', toStatus: 'En tránsito', attachmentIds: ['at-1'] }),
  ev({ id: 'ev-0412-4', tenantId: 'tn-andino', operationId: 'op-0412', type: 'news', occurredAt: '2026-11-10T16:00:00-05:00', title: 'Actualización de itinerario', description: 'El armador informó transbordo adicional en Panamá. ETA actualizada al 24-nov.', author: 'Andrea Vélez', visibility: 'client' }),

  // DO-26-0398
  ev({ id: 'ev-0398-1', tenantId: 'tn-andino', operationId: 'op-0398', type: 'status_change', occurredAt: '2026-09-22T10:00:00-05:00', title: 'Operación creada', description: 'DO creada para maquinaria de tejido.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0398-2', tenantId: 'tn-andino', operationId: 'op-0398', type: 'status_change', occurredAt: '2026-11-06T16:42:00-05:00', title: 'Llegada a puerto y paso a aduana', description: 'El buque arribó a Cartagena. La declaración de importación está en borrador y requiere revisión del cliente.', author: 'Andrea Vélez', fromStatus: 'En tránsito', toStatus: 'En aduana', attachmentIds: ['at-3'] }),
  ev({ id: 'ev-0398-3', tenantId: 'tn-andino', operationId: 'op-0398', type: 'action_required', occurredAt: '2026-11-07T09:30:00-05:00', title: 'Acción requerida: confirmar valor declarado', description: 'Por favor confirme el valor FOB declarado en la declaración borrador antes del 15-nov para evitar cargos por almacenaje.', author: 'Andrea Vélez', visibility: 'client' }),

  // DO-26-0433
  ev({ id: 'ev-0433-1', tenantId: 'tn-andino', operationId: 'op-0433', type: 'status_change', occurredAt: '2026-11-02T11:00:00-05:00', title: 'Operación creada', description: 'Consolidado LCL de muestras para Rotterdam.', author: 'Jorge Peña', toStatus: 'Creado' }),
  ev({ id: 'ev-0433-2', tenantId: 'tn-andino', operationId: 'op-0433', type: 'status_change', occurredAt: '2026-11-10T13:00:00-05:00', title: 'Ingreso a terminal', description: 'La carga ingresó al terminal de Cartagena para consolidación.', author: 'Jorge Peña', fromStatus: 'Creado', toStatus: 'En puerto' }),
  ev({ id: 'ev-0433-3', tenantId: 'tn-andino', operationId: 'op-0433', type: 'action_required', occurredAt: '2026-11-10T15:45:00-05:00', title: 'Acción requerida: lista de empaque', description: 'Necesitamos la lista de empaque firmada para cerrar la documentación del 13-nov.', author: 'Jorge Peña', visibility: 'client' }),

  // DO-26-0421, DO-26-0377, DO-26-0355 (eventos mínimos)
  ev({ id: 'ev-0421-1', tenantId: 'tn-andino', operationId: 'op-0421', type: 'status_change', occurredAt: '2026-11-08T10:00:00-05:00', title: 'Operación creada', description: 'Pendiente de reserva con naviera.', author: 'Luis Felipe Mora', toStatus: 'Creado' }),
  ev({ id: 'ev-0377-1', tenantId: 'tn-andino', operationId: 'op-0377', type: 'status_change', occurredAt: '2026-09-28T09:00:00-05:00', title: 'Operación creada', description: 'Carga aérea de telas técnicas.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0377-2', tenantId: 'tn-andino', operationId: 'op-0377', type: 'status_change', occurredAt: '2026-10-03T12:00:00-05:00', title: 'Entrega confirmada en Miami', description: 'Carga entregada al consignatario. Prueba de entrega adjunta en el archivo de documentos.', author: 'Andrea Vélez', fromStatus: 'En tránsito', toStatus: 'Entregado' }),
  ev({ id: 'ev-0355-1', tenantId: 'tn-andino', operationId: 'op-0355', type: 'status_change', occurredAt: '2026-08-16T17:00:00-05:00', title: 'Nacionalización completada', description: 'Declaración de importación aceptada. Operación cerrada.', author: 'Jorge Peña', fromStatus: 'En aduana', toStatus: 'Cerrado' }),

  // DO-26-0408 (Pacífico)
  ev({ id: 'ev-0408-1', tenantId: 'tn-pacifico', operationId: 'op-0408', type: 'status_change', occurredAt: '2026-10-28T09:00:00-05:00', title: 'Operación creada', description: 'Embarque de aguacate Hass para Rotterdam.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0408-2', tenantId: 'tn-pacifico', operationId: 'op-0408', type: 'document', occurredAt: '2026-11-03T08:30:00-05:00', title: 'Documento recibido: certificado fitosanitario', description: 'Certificado ICA recibido y validado.', author: 'Andrea Vélez', attachmentIds: ['at-6'] }),
  ev({ id: 'ev-0408-3', tenantId: 'tn-pacifico', operationId: 'op-0408', type: 'status_change', occurredAt: '2026-11-10T07:00:00-05:00', title: 'Ingreso a puerto', description: 'Contenedores ingresados a patio de Buenaventura.', author: 'Andrea Vélez', fromStatus: 'Creado', toStatus: 'En puerto' }),
  ev({ id: 'ev-0408-4', tenantId: 'tn-pacifico', operationId: 'op-0408', type: 'action_required', occurredAt: '2026-11-10T11:20:00-05:00', title: 'Acción requerida: packing list', description: 'Por favor confirme el packing list definitivo (cajas por calibre) antes de las 12:00 del 12-nov.', author: 'Andrea Vélez', visibility: 'client', attachmentIds: ['at-7'] }),

  // DO-26-0391 (Pacífico)
  ev({ id: 'ev-0391-1', tenantId: 'tn-pacifico', operationId: 'op-0391', type: 'status_change', occurredAt: '2026-10-10T09:00:00-05:00', title: 'Operación creada', description: 'Banano orgánico para Hamburgo.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0391-2', tenantId: 'tn-pacifico', operationId: 'op-0391', type: 'status_change', occurredAt: '2026-10-26T08:00:00-05:00', title: 'Zarpe confirmado', description: 'Buque zarpó de Buenaventura con ATD 26-oct.', author: 'Andrea Vélez', fromStatus: 'Creado', toStatus: 'En tránsito' }),
  ev({ id: 'ev-0391-3', tenantId: 'tn-pacifico', operationId: 'op-0391', type: 'news', occurredAt: '2026-11-09T10:00:00-05:00', title: 'Novedad: clima en ruta', description: 'Retraso estimado de 1 día por condiciones climáticas en el Canal de Panamá.', author: 'Andrea Vélez', visibility: 'client' }),

  // DO-26-0444 (Pacífico)
  ev({ id: 'ev-0444-1', tenantId: 'tn-pacifico', operationId: 'op-0444', type: 'status_change', occurredAt: '2026-10-15T09:00:00-05:00', title: 'Operación creada', description: 'Importación LCL de empaques.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0444-2', tenantId: 'tn-pacifico', operationId: 'op-0444', type: 'status_change', occurredAt: '2026-11-10T09:00:00-05:00', title: 'Pendiente de respuesta del cliente', description: 'Se requiere confirmar la consignación antes de liberar la carga.', author: 'Andrea Vélez', fromStatus: 'En tránsito', toStatus: 'Pendiente cliente' }),
  ev({ id: 'ev-0444-3', tenantId: 'tn-pacifico', operationId: 'op-0444', type: 'action_required', occurredAt: '2026-11-10T09:15:00-05:00', title: 'Acción requerida: confirmar consignatario', description: 'La aduana solicita confirmar el consignatario final (razón social y NIT).', author: 'Andrea Vélez', visibility: 'client' }),

  // DO-26-0360 (Pacífico)
  ev({ id: 'ev-0360-1', tenantId: 'tn-pacifico', operationId: 'op-0360', type: 'status_change', occurredAt: '2026-07-29T09:00:00-05:00', title: 'Operación creada', description: 'Flores de corte para Miami.', author: 'Andrea Vélez', toStatus: 'Creado' }),
  ev({ id: 'ev-0360-2', tenantId: 'tn-pacifico', operationId: 'op-0360', type: 'status_change', occurredAt: '2026-08-10T10:00:00-05:00', title: 'Operación cerrada', description: 'Documentación cerrada y entregada.', author: 'Andrea Vélez', fromStatus: 'Entregado', toStatus: 'Cerrado' }),
]

// ---------------------------------------------------------------------------
// Comentarios por evento (con respuestas anidadas vía parentCommentId)
// ---------------------------------------------------------------------------

export const eventComments: EventComment[] = [
  { id: 'cm-1', tenantId: 'tn-andino', operationId: 'op-0398', eventId: 'ev-0398-3', parentCommentId: null, authorId: 'us-luis', authorName: 'Luis Felipe Mora', authorSide: 'client', body: 'Recibido. Estamos revisando el FOB con el proveedor; le confirmamos mañana.', createdAt: '2026-11-07T10:05:00-05:00', visibility: 'client' },
  { id: 'cm-2', tenantId: 'tn-andino', operationId: 'op-0398', eventId: 'ev-0398-3', parentCommentId: 'cm-1', authorId: 'op-jpena', authorName: 'Jorge Peña', authorSide: 'operator', body: 'Perfecto. Si el FOB cambia más de 5%, hay que re-liquidar la tasa aduanera.', createdAt: '2026-11-07T11:40:00-05:00', visibility: 'client' },
  { id: 'cm-3', tenantId: 'tn-andino', operationId: 'op-0398', eventId: 'ev-0398-3', parentCommentId: 'cm-2', authorId: 'us-luis', authorName: 'Luis Felipe Mora', authorSide: 'client', body: 'Entendido. El cambio sería menor al 2%, lo confirmamos hoy.', createdAt: '2026-11-07T12:02:00-05:00', visibility: 'client' },
  { id: 'cm-4', tenantId: 'tn-andino', operationId: 'op-0398', eventId: 'ev-0398-3', parentCommentId: null, authorId: 'op-jpena', authorName: 'Jorge Peña', authorSide: 'operator', body: 'Nota interna: el agente de aduanas pidió copia de la póliza. (Solo visible para operadores.)', createdAt: '2026-11-07T13:00:00-05:00', visibility: 'internal' },
  { id: 'cm-5', tenantId: 'tn-andino', operationId: 'op-0433', eventId: 'ev-0433-3', parentCommentId: null, authorId: 'us-ana', authorName: 'Ana Lucía Torres', authorSide: 'client', body: 'Adjunto la lista firmada mañana a primera hora.', createdAt: '2026-11-10T16:10:00-05:00', visibility: 'client' },
  { id: 'cm-6', tenantId: 'tn-andino', operationId: 'op-0412', eventId: 'ev-0412-4', parentCommentId: null, authorId: 'us-ana', authorName: 'Ana Lucía Torres', authorSide: 'client', body: '¿El transbordo en Panamá cambia el costo de demoras?', createdAt: '2026-11-10T17:30:00-05:00', visibility: 'client' },
  { id: 'cm-7', tenantId: 'tn-andino', operationId: 'op-0412', eventId: 'ev-0412-4', parentCommentId: 'cm-6', authorId: 'op-aveles', authorName: 'Andrea Vélez', authorSide: 'operator', body: 'No cambia los días libres. Revisaremos el costo de transbordo y se lo confirmamos.', createdAt: '2026-11-10T18:05:00-05:00', visibility: 'client' },
  { id: 'cm-8', tenantId: 'tn-pacifico', operationId: 'op-0408', eventId: 'ev-0408-4', parentCommentId: null, authorId: 'us-diego', authorName: 'Diego Restrepo', authorSide: 'client', body: 'El packing list ya fue cargado en la solicitud. ¿Confirman que es la versión final?', createdAt: '2026-11-10T12:05:00-05:00', visibility: 'client' },
  { id: 'cm-9', tenantId: 'tn-pacifico', operationId: 'op-0444', eventId: 'ev-0444-3', parentCommentId: null, authorId: 'us-carla', authorName: 'Carla Niño', authorSide: 'client', body: 'La consignataria es Empaques del Valle S.A.S., NIT 900.123.456-7.', createdAt: '2026-11-10T15:00:00-05:00', visibility: 'client' },
]

// ---------------------------------------------------------------------------
// Documentos (el estado se deriva de expiresAt frente a DEMO_NOW)
// ---------------------------------------------------------------------------

export const documents: DocumentRecord[] = [
  { id: 'dc-1', tenantId: 'tn-andino', name: 'Certificado de existencia y representación legal', category: 'Legal', issuedAt: '2026-09-02', validFrom: '2026-09-02', expiresAt: '2027-01-15', status: 'vigente', version: 3, attachmentId: 'at-5', history: [{ version: 3, uploadedAt: '2026-09-02', uploadedBy: 'Ana Lucía Torres', note: 'Renovación anual' }, { version: 2, uploadedAt: '2025-09-01', uploadedBy: 'Ana Lucía Torres', note: 'Versión anterior' }] },
  { id: 'dc-2', tenantId: 'tn-andino', name: 'RUT', category: 'Legal', issuedAt: '2026-01-15', validFrom: '2026-01-15', expiresAt: '2026-11-25', status: 'vigente', version: 1, attachmentId: 'at-4', history: [{ version: 1, uploadedAt: '2026-01-15', uploadedBy: 'Ana Lucía Torres', note: 'Actualización anual' }] },
  { id: 'dc-3', tenantId: 'tn-andino', name: 'Autorización de operador económico (OEA)', category: 'Aduanero', issuedAt: '2025-11-20', validFrom: '2025-11-20', expiresAt: '2026-11-30', status: 'vigente', version: 2, attachmentId: null, history: [{ version: 2, uploadedAt: '2025-11-20', uploadedBy: 'Luis Felipe Mora', note: 'Renovación' }] },
  { id: 'dc-4', tenantId: 'tn-andino', name: 'Póliza de transporte de carga', category: 'Financiero', issuedAt: '2025-10-01', validFrom: '2025-10-01', expiresAt: '2026-10-01', status: 'vigente', version: 1, attachmentId: null, history: [{ version: 1, uploadedAt: '2025-10-01', uploadedBy: 'Ana Lucía Torres', note: 'Primera carga' }] },
  { id: 'dc-5', tenantId: 'tn-andino', name: 'Carta de autorización de agente de aduanas', category: 'Aduanero', issuedAt: '2026-03-10', validFrom: '2026-03-10', expiresAt: '2026-12-20', status: 'vigente', version: 1, attachmentId: null, history: [{ version: 1, uploadedAt: '2026-03-10', uploadedBy: 'Ana Lucía Torres', note: 'Autorización inicial' }] },
  { id: 'dc-6', tenantId: 'tn-andino', name: 'Estados financieros auditados', category: 'Financiero', issuedAt: '2025-06-30', validFrom: '2025-06-30', expiresAt: '2026-06-30', status: 'vigente', version: 2, attachmentId: null, history: [{ version: 2, uploadedAt: '2025-06-30', uploadedBy: 'Ana Lucía Torres', note: 'Cierre 2025' }] },
  { id: 'dc-7', tenantId: 'tn-pacifico', name: 'Certificado fitosanitario ICA', category: 'Operativo', issuedAt: '2026-11-03', validFrom: '2026-11-03', expiresAt: '2027-05-03', status: 'vigente', version: 1, attachmentId: 'at-6', history: [{ version: 1, uploadedAt: '2026-11-03', uploadedBy: 'Carla Niño', note: 'Emisión inicial' }] },
  { id: 'dc-8', tenantId: 'tn-pacifico', name: 'Póliza de seguro de carga 2026', category: 'Financiero', issuedAt: '2025-12-01', validFrom: '2025-12-01', expiresAt: '2026-11-28', status: 'vigente', version: 2, attachmentId: 'at-8', history: [{ version: 2, uploadedAt: '2025-12-01', uploadedBy: 'Carla Niño', note: 'Renovación anual' }] },
  { id: 'dc-9', tenantId: 'tn-pacifico', name: 'Registro de exportador', category: 'Aduanero', issuedAt: '2025-08-01', validFrom: '2025-08-01', expiresAt: '2026-08-01', status: 'vigente', version: 1, attachmentId: null, history: [{ version: 1, uploadedAt: '2025-08-01', uploadedBy: 'Diego Restrepo', note: 'Registro inicial' }] },
  { id: 'dc-10', tenantId: 'tn-pacifico', name: 'Cámara de comercio', category: 'Legal', issuedAt: '2026-02-10', validFrom: '2026-02-10', expiresAt: '2027-02-10', status: 'vigente', version: 1, attachmentId: null, history: [{ version: 1, uploadedAt: '2026-02-10', uploadedBy: 'Carla Niño', note: 'Actualización anual' }] },
]

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export const quotes: Quote[] = [
  {
    id: 'qt-1001', tenantId: 'tn-andino', number: 'COT-2026-1001', issuedAt: '2026-11-03', validUntil: '2026-11-20', version: 2,
    service: 'Flete marítimo FCL 40HC', origin: 'Shanghái (CNSHA)', destination: 'Cartagena (COCTG)', currency: 'USD', status: 'Pendiente',
    lines: [
      { id: 'ql-1', concept: 'Flete ocean FCL 40HC', quantity: 2, unit: 'contenedor', unitPrice: 2150 },
      { id: 'ql-2', concept: 'Recargo por combustible (BAF)', quantity: 2, unit: 'contenedor', unitPrice: 320 },
      { id: 'ql-3', concept: 'Gastos locales en origen (THC)', quantity: 2, unit: 'contenedor', unitPrice: 185 },
      { id: 'ql-4', concept: 'Seguro de carga (tasa)', quantity: 1, unit: 'embarque', unitPrice: 240 },
    ],
    conditions: 'Tarifa válida para embarques con ETD hasta el 30-nov-2026. Sujeta a disponibilidad de espacio.',
    observations: 'Versión 2: se ajustó el BAF según el índice de combustible de octubre.',
  },
  {
    id: 'qt-1002', tenantId: 'tn-andino', number: 'COT-2026-0987', issuedAt: '2026-10-12', validUntil: '2026-11-05', version: 1,
    service: 'Transporte terrestre Funza → Cartagena', origin: 'Funza (CO)', destination: 'Cartagena (CO)', currency: 'COP', status: 'Vencida',
    lines: [
      { id: 'ql-5', concept: 'Tractomula 3S3', quantity: 1, unit: 'viaje', unitPrice: 3850000 },
      { id: 'ql-6', concept: 'Peajes', quantity: 1, unit: 'viaje', unitPrice: 412000 },
    ],
    conditions: 'Incluye cargue y descargue básico.', observations: '',
  },
  {
    id: 'qt-1003', tenantId: 'tn-andino', number: 'COT-2026-1010', issuedAt: '2026-11-07', validUntil: '2026-12-07', version: 1,
    service: 'Carga aérea Bogotá → Miami', origin: 'Bogotá (BOG)', destination: 'Miami (MIA)', currency: 'USD', status: 'Pendiente',
    lines: [
      { id: 'ql-7', concept: 'Tarifa aérea por kg', quantity: 850, unit: 'kg', unitPrice: 3.1 },
      { id: 'ql-8', concept: 'Manejo en terminal', quantity: 1, unit: 'embarque', unitPrice: 120 },
    ],
    conditions: 'Peso volumétrico mínimo 1 kg por pieza.', observations: 'Sujeta a confirmación de espacio con aerolínea.',
  },
  {
    id: 'qt-2001', tenantId: 'tn-pacifico', number: 'COT-2026-2001', issuedAt: '2026-11-01', validUntil: '2026-11-30', version: 1,
    service: 'Flete marítimo reefer 40RH', origin: 'Buenaventura (COBUN)', destination: 'Rotterdam (NLRTM)', currency: 'USD', status: 'Pendiente',
    lines: [
      { id: 'ql-9', concept: 'Flete reefer 40RH', quantity: 4, unit: 'contenedor', unitPrice: 3400 },
      { id: 'ql-10', concept: 'Monitoreo de temperatura', quantity: 4, unit: 'contenedor', unitPrice: 95 },
      { id: 'ql-11', concept: 'Gastos locales destino', quantity: 4, unit: 'contenedor', unitPrice: 260 },
    ],
    conditions: 'Pago contra factura en 30 días. Requiere certificado fitosanitario.',
    observations: 'Tarifa preferencial por volumen anual.',
  },
  {
    id: 'qt-2002', tenantId: 'tn-pacifico', number: 'COT-2026-1875', issuedAt: '2026-08-20', validUntil: '2026-09-20', version: 1,
    service: 'Carga aérea Cali → Madrid', origin: 'Cali (CLO)', destination: 'Madrid (MAD)', currency: 'EUR', status: 'Aceptada',
    lines: [{ id: 'ql-12', concept: 'Tarifa aérea por kg', quantity: 600, unit: 'kg', unitPrice: 2.8 }],
    conditions: 'Vigencia del servicio sujeta a la temporada.', observations: 'Aceptada por el cliente el 25-ago-2026.',
  },
]

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

export const requests: Request[] = [
  { id: 'rq-1', tenantId: 'tn-andino', number: 'SOL-0341', type: 'Documentación', subject: 'Copia de póliza para agente de aduanas', description: 'Necesitamos la copia de la póliza de transporte vigente para el DO-26-0398.', operationId: 'op-0398', status: 'En revisión', createdAt: '2026-11-07T13:10:00-05:00', updatedAt: '2026-11-08T09:00:00-05:00', attachmentIds: [], createdBy: 'us-luis' },
  { id: 'rq-2', tenantId: 'tn-andino', number: 'SOL-0328', type: 'Cotización', subject: 'Cotización de carga aérea a Miami', description: 'Solicitamos cotización para 850 kg con salida la semana del 16-nov.', operationId: null, status: 'Respondida', createdAt: '2026-11-05T10:00:00-05:00', updatedAt: '2026-11-07T11:30:00-05:00', attachmentIds: [], createdBy: 'us-ana' },
  { id: 'rq-3', tenantId: 'tn-andino', number: 'SOL-0302', type: 'Modificación de datos', subject: 'Actualizar dirección de bodega', description: 'Cambio de dirección de bodega de consolidación a Funza.', operationId: null, status: 'Cerrada', createdAt: '2026-09-15T08:00:00-05:00', updatedAt: '2026-09-18T15:00:00-05:00', attachmentIds: [], createdBy: 'us-ana' },
  { id: 'rq-4', tenantId: 'tn-pacifico', number: 'SOL-0355', type: 'Consulta', subject: 'Fecha de cierre documental DO-26-0408', description: '¿Cuál es la fecha límite exacta para entregar el packing list?', operationId: 'op-0408', status: 'Recibida', createdAt: '2026-11-10T08:00:00-05:00', updatedAt: '2026-11-10T08:00:00-05:00', attachmentIds: ['at-7'], createdBy: 'us-diego' },
]

export const DEMO_DATA_VERSION = '2026.11-fase01'
