import { describe, expect, it } from "vitest";
import { staffSectionFor } from "./staff-route-policy";

describe("política de rutas para personal interno", () => {
  it.each(["/cuenta", "/solicitudes/nueva", "/documentos", "/cotizaciones", "/cotizaciones/quote-id"])(
    "monta la pantalla administrativa real en %s",
    (pathname) => expect(staffSectionFor(pathname, true)).toBeNull(),
  );

  it("decide el detalle de operación con el contexto activo, no con una sesión genérica", () => {
    expect(staffSectionFor("/operaciones/operation-id", false)).toEqual({
      title: "Detalle de operación",
      noun: "operaciones",
    });
    expect(staffSectionFor("/operaciones/operation-id", true)).toBeNull();
  });

  it("mantiene indisponible el perfil sin contrato administrativo", () => {
    expect(staffSectionFor("/perfil", true)).toEqual({
      title: "Mi perfil",
      noun: "datos de perfil",
    });
  });
});
