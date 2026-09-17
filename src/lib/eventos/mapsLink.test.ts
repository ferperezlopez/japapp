import { describe, expect, it } from "vitest";
import { buildMapsLink } from "./mapsLink";

describe("buildMapsLink", () => {
  it("arma un link de Directions para texto plano", () => {
    expect(buildMapsLink("Av. Cabildo 2394, CABA")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Av.%20Cabildo%202394%2C%20CABA",
    );
  });

  it("usa tal cual un link de Google Maps ya resuelto", () => {
    const link = "https://maps.app.goo.gl/v5XJqQabc123";
    expect(buildMapsLink(link)).toBe(link);
  });

  it("usa tal cual un link largo de google.com/maps", () => {
    const link = "https://www.google.com/maps/place/Algo/@-34.6,-58.4,17z";
    expect(buildMapsLink(link)).toBe(link);
  });

  it("recorta espacios antes de decidir el formato", () => {
    const link = "  https://maps.app.goo.gl/v5XJqQabc123  ";
    expect(buildMapsLink(link)).toBe("https://maps.app.goo.gl/v5XJqQabc123");
  });
});
