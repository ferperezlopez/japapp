import { describe, expect, it } from "vitest";
import { METRIC_KIND, METRIC_POLARITY, deltaView, describeDelta, isEqualDiff, toneOf } from "./delta";

describe("toneOf", () => {
  it("donde más es mejor: sube = verde, baja = rojo", () => {
    expect(toneOf(2, "count", "higher-better")).toBe("good");
    expect(toneOf(-2, "count", "higher-better")).toBe("bad");
  });

  it("donde menos es mejor (gasto, costo): sube = rojo, baja = verde", () => {
    expect(toneOf(5_000, "money", "lower-better")).toBe("bad");
    expect(toneOf(-5_000, "money", "lower-better")).toBe("good");
  });

  it("una diferencia que se redondea a cero es «igual», sin color", () => {
    expect(toneOf(0, "count", "higher-better")).toBe("equal");
    expect(toneOf(0.4, "money", "lower-better")).toBe("equal");
    expect(toneOf(-0.4, "money", "lower-better")).toBe("equal");
    expect(toneOf(0.04, "count", "higher-better")).toBe("equal");
    expect(toneOf(0.004, "ratio", "higher-better")).toBe("equal");
  });

  it("el borde: justo en el umbral ya es una variación", () => {
    expect(isEqualDiff(0.5, "money")).toBe(false);
    expect(isEqualDiff(0.49, "money")).toBe(true);
    expect(isEqualDiff(0.05, "count")).toBe(false);
    expect(isEqualDiff(0.005, "ratio")).toBe(false);
    expect(isEqualDiff(-0.5, "money")).toBe(false);
  });
});

describe("polaridad de cada medida", () => {
  it("más asistencia es mejor; más gasto o costo, peor", () => {
    expect(METRIC_POLARITY.confirmed).toBe("higher-better");
    expect(METRIC_POLARITY.ratio).toBe("higher-better");
    expect(METRIC_POLARITY.total).toBe("lower-better");
    expect(METRIC_POLARITY.costPerPerson).toBe("lower-better");
    expect(METRIC_POLARITY.medianItem).toBe("lower-better");
  });

  it("cada medida se compara en su unidad: cantidad, puntos o plata", () => {
    expect(METRIC_KIND).toEqual({
      confirmed: "count",
      ratio: "ratio",
      total: "money",
      costPerPerson: "money",
      medianItem: "money",
    });
  });
});

describe("describeDelta", () => {
  it("asistencia: la diferencia en puntos", () => {
    expect(describeDelta({ base: 0.4, diff: -0.02, pct: -0.05 }, "ratio")).toBe("-2 pts");
    expect(describeDelta({ base: 0.4, diff: 0.1, pct: 0.25 }, "ratio")).toBe("+10 pts");
  });

  it("plata: porcentaje y diferencia", () => {
    expect(describeDelta({ base: 100, diff: 7, pct: 0.07 }, "money")).toBe("+7% (+$7)");
    expect(describeDelta({ base: 40_000, diff: -12_000, pct: -0.3 }, "money")).toBe("-30% (-$12.000)");
  });

  it("cantidades: diferencia y porcentaje", () => {
    expect(describeDelta({ base: 5, diff: 1, pct: 0.2 }, "count")).toBe("+1 (+20%)");
    expect(describeDelta({ base: 6, diff: -1.5, pct: -0.25 }, "count")).toBe("-1,5 (-25%)");
  });

  it("sin porcentaje (la base es 0) va solo la diferencia", () => {
    expect(describeDelta({ base: 0, diff: 50, pct: null }, "money")).toBe("+$50");
    expect(describeDelta({ base: 0, diff: 3, pct: null }, "count")).toBe("+3");
  });
});

describe("deltaView", () => {
  it("más asistencia: va para arriba y es bueno", () => {
    expect(deltaView({ base: 5, diff: 1, pct: 0.2 }, "count", "higher-better")).toEqual({
      tone: "good",
      direction: "up",
      text: "+1 (+20%)",
    });
  });

  it("menos gasto: va para abajo y es bueno; más gasto, para arriba y malo", () => {
    expect(deltaView({ base: 100, diff: -30, pct: -0.3 }, "money", "lower-better")).toEqual({
      tone: "good",
      direction: "down",
      text: "-30% (-$30)",
    });
    expect(deltaView({ base: 100, diff: 30, pct: 0.3 }, "money", "lower-better")).toMatchObject({
      tone: "bad",
      direction: "up",
    });
  });

  it("menos asistencia: para abajo y malo", () => {
    expect(deltaView({ base: 0.5, diff: -0.1, pct: -0.2 }, "ratio", "higher-better")).toEqual({
      tone: "bad",
      direction: "down",
      text: "-10 pts",
    });
  });

  it("una diferencia que se redondea a cero es «igual», sin dirección", () => {
    expect(deltaView({ base: 100, diff: 0.2, pct: 0.002 }, "money", "lower-better")).toEqual({
      tone: "equal",
      direction: "flat",
      text: "igual",
    });
  });
});
