export interface StaffSectionNotice {
  title: string;
  noun: string;
  description?: string;
}
/**
 * Decide qué rutas todavía no tienen un contrato administrativo seguro.
 *
 * Cuenta y nueva solicitud no aparecen aquí: ambas disponen de endpoints de
 * personal que validan el contexto activo en FastAPI y deben montar su ruta real.
 */
export function staffSectionFor(
  pathname: string,
  hasActiveTenant: boolean,
): StaffSectionNotice | null {
  if (pathname === "/documentos")
    return { title: "Documentos", noun: "documentos" };
  if (pathname === "/perfil")
    return { title: "Mi perfil", noun: "datos de perfil" };
  if (!hasActiveTenant && /^\/operaciones\/[^/]+$/.test(pathname)) {
    return { title: "Detalle de operación", noun: "operaciones" };
  }
  if (pathname === "/cotizaciones") {
    return { title: "Cotizaciones", noun: "cotizaciones" };
  }
  if (/^\/cotizaciones\/[^/]+$/.test(pathname)) {
    return { title: "Detalle de cotización", noun: "cotizaciones" };
  }
  return null;
}
