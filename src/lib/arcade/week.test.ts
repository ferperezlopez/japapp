import { describe, expect, it } from "vitest";
import { formatArcadeWeek, startOfArcadeWeek } from "./week";

// El lunes 5/10/2026 a las 00:00 en Buenos Aires (UTC-3) son las 03:00 UTC.
const MONDAY_OCT_5_START = "2026-10-05T03:00:00.000Z";

describe("startOfArcadeWeek", () => {
  it("un sábado cae en el lunes anterior a las 00:00 de Buenos Aires", () => {
    const saturday = new Date("2026-10-10T15:00:00Z"); // sábado 12:00 en Buenos Aires
    expect(startOfArcadeWeek(saturday).toISOString()).toBe(MONDAY_OCT_5_START);
  });

  it("el lunes a las 00:00 en punto ya es la semana nueva", () => {
    expect(startOfArcadeWeek(new Date(MONDAY_OCT_5_START)).toISOString()).toBe(MONDAY_OCT_5_START);
  });

  it("un milisegundo antes del lunes 00:00 todavía es la semana anterior", () => {
    const justBefore = new Date("2026-10-05T02:59:59.999Z"); // domingo 23:59:59.999 en Buenos Aires
    expect(startOfArcadeWeek(justBefore).toISOString()).toBe("2026-09-28T03:00:00.000Z");
  });

  it("el domingo a la noche (hora de Buenos Aires) sigue en la misma semana", () => {
    // Domingo 11/10 23:59 en Buenos Aires = lunes 12/10 02:59 UTC.
    const sundayNight = new Date("2026-10-12T02:59:00Z");
    expect(startOfArcadeWeek(sundayNight).toISOString()).toBe(MONDAY_OCT_5_START);
    // Y a las 03:00 UTC ya es la semana siguiente.
    expect(startOfArcadeWeek(new Date("2026-10-12T03:00:00Z")).toISOString()).toBe(
      "2026-10-12T03:00:00.000Z",
    );
  });

  it("a la madrugada UTC todavía es el día anterior en Buenos Aires", () => {
    // Lunes 5/10 01:00 UTC = domingo 4/10 22:00 en Buenos Aires → semana del 28/9.
    expect(startOfArcadeWeek(new Date("2026-10-05T01:00:00Z")).toISOString()).toBe(
      "2026-09-28T03:00:00.000Z",
    );
  });

  it("cruza el fin de año sin problemas", () => {
    // Jueves 31/12/2026 → la semana empezó el lunes 28/12.
    expect(startOfArcadeWeek(new Date("2026-12-31T12:00:00Z")).toISOString()).toBe(
      "2026-12-28T03:00:00.000Z",
    );
  });

  it("no depende de la zona horaria del servidor", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Auckland";
      expect(startOfArcadeWeek(new Date("2026-10-10T15:00:00Z")).toISOString()).toBe(
        MONDAY_OCT_5_START,
      );
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("formatArcadeWeek", () => {
  it("dentro de un mismo mes: '5 al 11 de octubre'", () => {
    expect(formatArcadeWeek(new Date("2026-10-10T15:00:00Z"))).toBe("5 al 11 de octubre");
  });

  it("si cruza de mes, nombra los dos meses", () => {
    expect(formatArcadeWeek(new Date("2026-10-05T02:59:00Z"))).toBe(
      "28 de septiembre al 4 de octubre",
    );
  });

  it("si cruza de año, también", () => {
    expect(formatArcadeWeek(new Date("2026-12-31T12:00:00Z"))).toBe(
      "28 de diciembre al 3 de enero",
    );
  });
});
