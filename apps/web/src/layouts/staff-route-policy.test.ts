import { describe, expect, it } from "vitest";
import { staffSectionFor } from "./staff-route-policy";

describe("política de rutas para personal interno", () => {
  it.each(["/cuenta", "/solicitudes/nueva"])(
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

  it("mantiene indisponibles los módulos sin contrato administrativo completo", () => {
    expect(staffSectionFor("/documentos", true)).toEqual({
      title: "Documentos",
      noun: "documentos",
    });
    expect(staffSectionFor("/cotizaciones/quote-id", true)).toEqual({
      title: "Detalle de cotización",
      noun: "cotizaciones",
    });
  });
});
