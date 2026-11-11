/**
 * Contenido estructurado de los textos legales. ESTADO: BORRADOR para revisión jurídica.
 * No es una política aprobada. Los datos marcados como PENDIENTE se completan desde legal-meta.json
 * una vez aprobados por Logixtic.
 */
export interface LegalSection {
  id: string
  title: string
  paragraphs: string[]
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'objeto',
    title: '1. Objeto del portal',
    paragraphs: [
      'El Portal de Clientes de Logixtic permite a las empresas clientes y a sus usuarios autorizados consultar operaciones logísticas, documentos, cotizaciones y solicitudes, y comunicarse con su equipo de operaciones.',
    ],
  },
  {
    id: 'uso',
    title: '2. Uso autorizado',
    paragraphs: [
      'El acceso es personal e intransferible. Cada usuario debe usar el portal únicamente para los fines de su empresa y dentro de los permisos asignados.',
      'Está prohibido intentar acceder a información de otras empresas, eludir los controles de acceso o usar el portal para fines distintos a la relación comercial y operativa con Logixtic.',
    ],
  },
  {
    id: 'cuentas',
    title: '3. Responsabilidades de cuentas y usuarios',
    paragraphs: [
      'La persona que crea una cuenta es responsable de mantener la confidencialidad de su contraseña y de la actividad realizada desde su cuenta.',
      'Debes notificar cualquier uso no autorizado a tu ejecutivo de cuenta de Logixtic.',
    ],
  },
  {
    id: 'operacional',
    title: '4. Información operacional',
    paragraphs: [
      'Los estados, fechas y eventos de las operaciones reflejan la información registrada por Logixtic en el momento de su consulta. Pueden cambiar conforme avanza cada operación.',
      'El portal no reemplaza los documentos oficiales de transporte ni las comunicaciones formales entre las partes.',
    ],
  },
  {
    id: 'documentos',
    title: '5. Documentos',
    paragraphs: [
      'Los documentos consultados en el portal deben usarse según las condiciones de la operación a la que pertenecen. Su vigencia y versión se muestran como referencia.',
    ],
  },
  {
    id: 'disponibilidad',
    title: '6. Disponibilidad',
    paragraphs: [
      'Logixtic procurará mantener el portal disponible, sin garantizar la ausencia de interrupciones por mantenimiento o causas ajenas a su control.',
    ],
  },
  {
    id: 'propiedad',
    title: '7. Propiedad intelectual',
    paragraphs: [
      'La marca, el diseño y el contenido del portal son propiedad de Logixtic o de sus licenciantes. Su uso no autoriza la reproducción fuera del fin previsto en estos términos.',
    ],
  },
  {
    id: 'contacto',
    title: '8. Contacto empresarial',
    paragraphs: ['Para dudas sobre estos términos, comunícate con tu ejecutivo de cuenta de Logixtic.'],
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: '1. Responsable del tratamiento',
    paragraphs: ['El responsable del tratamiento de los datos personales es Logixtic. Los datos de identificación del responsable se indican en el bloque de datos pendientes de aprobación.'],
  },
  {
    id: 'finalidades',
    title: '2. Finalidades',
    paragraphs: [
      'Crear y administrar tu cuenta de usuario del portal.',
      'Permitir la consulta de operaciones, documentos, cotizaciones y solicitudes de tu empresa.',
      'Comunicarte información relacionada con las operaciones y el servicio.',
      'Garantizar la seguridad del acceso y prevenir usos indebidos.',
    ],
  },
  {
    id: 'categorias',
    title: '3. Categorías de datos',
    paragraphs: [
      'Datos de identificación y contacto: nombre completo y correo electrónico.',
      'Datos de la cuenta: empresa asignada, rol, fechas de creación y último acceso, y versión de términos aceptada.',
      'Datos derivados del uso del portal necesarios para la seguridad del acceso.',
    ],
  },
  {
    id: 'derechos',
    title: '4. Derechos de los titulares',
    paragraphs: [
      'Puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, así como revocar las autorizaciones otorgadas, en los términos de la ley aplicable.',
      'El procedimiento para ejercer estos derechos está pendiente de aprobación.',
    ],
  },
  {
    id: 'seguridad',
    title: '5. Seguridad',
    paragraphs: [
      'Las contraseñas se almacenan únicamente en forma cifrada mediante funciones de derivación de claves con sal. Las sesiones se identifican con tokens aleatorios que no se muestran en pantalla.',
      'Las medidas técnicas definitivas se documentarán al implementar el proveedor de autenticación.',
    ],
  },
  {
    id: 'conservacion',
    title: '6. Conservación',
    paragraphs: ['Los plazos de conservación de los datos están pendientes de aprobación.'],
  },
  {
    id: 'canales',
    title: '7. Canales de contacto',
    paragraphs: ['Las vías de contacto para consultas sobre privacidad están pendientes de aprobación. Mientras tanto, comunícate con tu ejecutivo de cuenta.'],
  },
]
