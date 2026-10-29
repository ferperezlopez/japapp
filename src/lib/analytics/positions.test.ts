import { describe, expect, it } from "vitest";
import {
  POSITION_KEYS,
  POSITION_LABELS,
  buildPositions,
  formatPositionValue,
  formatRank,
  type PositionSource,
} from "./positions";
import type { PositionKey } from "./types";

const values = (over: Partial<Record<PositionKey, number | null>> = {}): PositionSource["values"] => ({
  confirmed: 0,
  ratio: null,
  total: null,
  costPerPerson: null,
  medianItem: null,
  items: null,
  guests: 0,
  futbolConfirmed: null,
  ...over,
});

describe("buildPositions", () => {
  it("el puesto 1 es el valor más alto, y guarda los valores de todos de mayor a menor", () => {
    const result = buildPositions([
      { id: "a", values: values({ confirmed: 5 }) },
      { id: "b", values: values({ confirmed: 9 }) },
      { id: "c", values: values({ confirmed: 7 }) },
    ]);
    expect(result.get("b")?.confirmed).toEqual({ value: 9, rank: 1, of: 3, peers: [9, 7, 5] });
    expect(result.get("c")?.confirmed.rank).toBe(2);
    expect(result.get("a")?.confirmed.rank).toBe(3);
  });

  it("los empates comparten puesto y el siguiente salta (1, 1, 3)", () => {
    const result = buildPositions([
      { id: "a", values: values({ total: 100 }) },
      { id: "b", values: values({ total: 100 }) },
      { id: "c", values: values({ total: 50 }) },
    ]);
    expect([result.get("a")?.total.rank, result.get("b")?.total.rank, result.get("c")?.total.rank]).toEqual([1, 1, 3]);
  });

  it("un evento sin dato en una categoría no rankea ahí y no cuenta entre los demás", () => {
    const result = buildPositions([
      { id: "a", values: values({ total: 100 }) },
      { id: "b", values: values({ total: null }) },
      { id: "c", values: values({ total: 40 }) },
    ]);
    expect(result.get("b")?.total).toEqual({ value: null, rank: null, of: 2, peers: [100, 40] });
    expect(result.get("c")?.total.rank).toBe(2);
    expect(result.get("c")?.total.of).toBe(2);
  });

  it("cada categoría se rankea por separado", () => {
    const result = buildPositions([
      { id: "a", values: values({ confirmed: 9, total: 10 }) },
      { id: "b", values: values({ confirmed: 3, total: 90 }) },
    ]);
    expect(result.get("a")?.confirmed.rank).toBe(1);
    expect(result.get("a")?.total.rank).toBe(2);
    expect(result.get("b")?.confirmed.rank).toBe(2);
    expect(result.get("b")?.total.rank).toBe(1);
  });

  it("un solo evento es 1.º de 1; el cero también rankea (no es «sin dato»)", () => {
    const result = buildPositions([{ id: "a", values: values({ guests: 0 }) }]);
    expect(result.get("a")?.guests).toEqual({ value: 0, rank: 1, of: 1, peers: [0] });
  });

  it("sin eventos no hay nada", () => {
    expect(buildPositions([]).size).toBe(0);
  });

  it("cubre todas las categorías", () => {
    const result = buildPositions([{ id: "a", values: values() }]);
    expect(Object.keys(result.get("a") ?? {}).sort()).toEqual([...POSITION_KEYS].sort());
    for (const key of POSITION_KEYS) expect(POSITION_LABELS[key]).toBeTruthy();
  });
});

describe("formatos", () => {
  it("el valor se muestra según la categoría: cantidad, porcentaje o plata", () => {
    expect(formatPositionValue("confirmed", 5)).toBe("5");
    expect(formatPositionValue("ratio", 0.357)).toBe("36%");
    expect(formatPositionValue("total", 187_705)).toBe("$188 mil");
    expect(formatPositionValue("costPerPerson", 37_541)).toBe("$37,5 mil");
  });

  it("el puesto se dice «#2 de 3»", () => {
    expect(formatRank(2, 3)).toBe("#2 de 3");
  });
});
