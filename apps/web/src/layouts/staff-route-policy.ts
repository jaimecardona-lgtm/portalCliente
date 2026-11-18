export interface StaffSectionNotice {
  title: string;
  noun: string;
  description?: string;
}
/**
 * Decide qué rutas todavía no tienen un contrato administrativo seguro.
 *
 * Cuenta, documentos, cotizaciones y nueva solicitud no aparecen aquí: disponen de
 * endpoints de personal que validan el contexto activo en FastAPI.
 */
export function staffSectionFor(
  pathname: string,
  hasActiveTenant: boolean,
): StaffSectionNotice | null {
  if (pathname === "/perfil")
    return { title: "Mi perfil", noun: "datos de perfil" };
  if (!hasActiveTenant && /^\/operaciones\/[^/]+$/.test(pathname)) {
    return { title: "Detalle de operación", noun: "operaciones" };
  }
  return null;
}
