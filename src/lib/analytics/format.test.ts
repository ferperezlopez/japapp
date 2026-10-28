import { describe, expect, it } from "vitest";
import {
  formatDay,
  formatDayLong,
  formatDayShort,
  formatMoney,
  formatMoneyCompact,
  formatMoneyCompactSigned,
  formatMoneySigned,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatPercentSigned,
  formatPoints,
  formatSignedNumber,
  orDash,
  plural,
} from "./format";

describe("formatMoney", () => {
  it("pesos enteros con punto de miles, también de 4 dígitos", () => {
    expect(formatMoney(273_201)).toBe("$273.201");
    expect(formatMoney(9_876)).toBe("$9.876");
    expect(formatMoney(1_234_567)).toBe("$1.234.567");
    expect(formatMoney(18_000)).toBe("$18.000");
  });

  it("redondea los centavos", () => {
    expect(formatMoney(37_541.666)).toBe("$37.542");
    expect(formatMoney(0.4)).toBe("$0");
  });

  it("medio peso redondea para arriba, también en negativo", () => {
    expect(formatMoney(0.5)).toBe("$1");
    expect(formatMoney(-0.5)).toBe("-$1");
    expect(formatMoney(0.49)).toBe("$0");
  });

  it("negativos con signo adelante; nunca «-$0»", () => {
    expect(formatMoney(-1_500)).toBe("-$1.500");
    expect(formatMoney(-0.2)).toBe("$0");
    expect(formatMoney(-0)).toBe("$0");
  });
});

describe("formatMoneySigned", () => {
  it("siempre con signo, salvo el cero", () => {
    expect(formatMoneySigned(1_500)).toBe("+$1.500");
    expect(formatMoneySigned(-1_500)).toBe("-$1.500");
    expect(formatMoneySigned(0)).toBe("$0");
    expect(formatMoneySigned(0.3)).toBe("$0");
  });
});

describe("formatMoneyCompact", () => {
  it("hasta 9.999 va entero", () => {
    expect(formatMoneyCompact(9_876)).toBe("$9.876");
    expect(formatMoneyCompact(0)).toBe("$0");
  });

  it("miles: con un decimal bajo 100 mil y entero desde ahí", () => {
    expect(formatMoneyCompact(10_000)).toBe("$10 mil");
    expect(formatMoneyCompact(45_534)).toBe("$45,5 mil");
    expect(formatMoneyCompact(273_201)).toBe("$273 mil");
    expect(formatMoneyCompact(631_306)).toBe("$631 mil");
  });

  it("millones: con un decimal", () => {
    expect(formatMoneyCompact(1_200_000)).toBe("$1,2 M");
    expect(formatMoneyCompact(25_000_000)).toBe("$25 M");
  });

  it("el borde no dice «1.000 mil»: pasa a millones", () => {
    expect(formatMoneyCompact(999_499)).toBe("$999 mil");
    expect(formatMoneyCompact(999_500)).toBe("$1 M");
  });

  it("negativos", () => {
    expect(formatMoneyCompact(-45_534)).toBe("-$45,5 mil");
  });
});

describe("formatMoneyCompactSigned", () => {
  it("con signo explícito, salvo el cero", () => {
    expect(formatMoneyCompactSigned(180_000)).toBe("+$180 mil");
    expect(formatMoneyCompactSigned(-45_534)).toBe("-$45,5 mil");
    expect(formatMoneyCompactSigned(1_500)).toBe("+$1.500");
    expect(formatMoneyCompactSigned(0)).toBe("$0");
    expect(formatMoneyCompactSigned(-0.2)).toBe("$0");
  });
});

describe("números y porcentajes", () => {
  it("decimales con coma y a lo sumo uno", () => {
    expect(formatNumber(5.333)).toBe("5,3");
    expect(formatNumber(6)).toBe("6");
    expect(formatNumber(1_234.5)).toBe("1.234,5");
  });

  it("con signo: +/-, y «0» si no hay diferencia", () => {
    expect(formatSignedNumber(2)).toBe("+2");
    expect(formatSignedNumber(-1.5)).toBe("-1,5");
    expect(formatSignedNumber(0)).toBe("0");
    expect(formatSignedNumber(0.04)).toBe("0");
  });

  it("porcentaje de un ratio", () => {
    expect(formatPercent(0.4286)).toBe("43%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.004)).toBe("0%");
  });

  it("variación relativa con signo", () => {
    expect(formatPercentSigned(0.07)).toBe("+7%");
    expect(formatPercentSigned(-0.31)).toBe("-31%");
    expect(formatPercentSigned(0)).toBe("0%");
    expect(formatPercentSigned(-0.001)).toBe("0%");
    expect(formatPercentSigned(2)).toBe("+200%");
  });

  it("diferencia de porcentajes en puntos", () => {
    expect(formatPoints(0.0714)).toBe("+7 pts");
    expect(formatPoints(-0.03)).toBe("-3 pts");
    expect(formatPoints(0)).toBe("0 pts");
  });
});

describe("fechas (hora de Argentina, sin importar la zona del servidor)", () => {
  it("día y mes", () => {
    expect(formatDay("2026-09-18T19:30:00Z")).toBe("18 sept");
    expect(formatDay("2026-10-02T20:00:00Z")).toBe("2 oct");
  });

  it("un evento de las 21 h de Argentina (00 h UTC del día siguiente) conserva su día", () => {
    // 21:00 en Argentina del 16/10 = 00:00 UTC del 17/10
    expect(formatDay("2026-10-17T00:00:00Z")).toBe("16 oct");
  });

  it("rótulo corto para los ejes, también en hora de Argentina", () => {
    expect(formatDayShort("2026-09-18T19:30:00Z")).toBe("18/9");
    expect(formatDayShort("2026-10-17T00:00:00Z")).toBe("16/10");
  });

  it("con día de la semana", () => {
    expect(formatDayLong("2026-10-30T20:00:00Z")).toBe("vie, 30 oct");
  });

  it("mes y año", () => {
    expect(formatMonthYear("2026-09-18T19:30:00Z")).toBe("sept 2026");
  });
});

describe("orDash y plural", () => {
  it("orDash: «—» si no hay dato, y el valor formateado si hay (también el 0)", () => {
    expect(orDash(null, formatPercent)).toBe("—");
    expect(orDash(0, formatPercent)).toBe("0%");
    expect(orDash(0.5, formatPercent)).toBe("50%");
  });

  it("plural: singular solo con 1 (el 0 va en plural)", () => {
    expect(plural(1, "evento", "eventos")).toBe("1 evento");
    expect(plural(2, "evento", "eventos")).toBe("2 eventos");
    expect(plural(0, "invitado", "invitados")).toBe("0 invitados");
  });
});
