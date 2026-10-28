import { describe, expect, it } from "vitest";
import { compare, compareAt, fraction, mean, median, roundTo, sum, summarizeSeries } from "./stats";

describe("sum y mean", () => {
  it("suma, y 0 si no hay nada que sumar", () => {
    expect(sum([1, 2, 3.5])).toBe(6.5);
    expect(sum([])).toBe(0);
  });

  it("el promedio de una lista vacía es null (sin dato), no 0 ni NaN", () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4, 9])).toBe(5);
  });
});

describe("median", () => {
  it("sin datos devuelve null", () => {
    expect(median([])).toBeNull();
  });

  it("cantidad impar: el del medio, sin importar el orden de entrada", () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([7])).toBe(7);
  });

  it("cantidad par: el promedio de los dos del medio", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
  });

  it("no se mueve por un valor extremo, a diferencia del promedio", () => {
    const gastos = [18_000, 20_000, 22_000, 25_000, 400_000];
    expect(median(gastos)).toBe(22_000);
    expect(mean(gastos)).toBe(97_000);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [3, 1, 2];
    median(original);
    expect(original).toEqual([3, 1, 2]);
  });
});

describe("roundTo", () => {
  it("redondea a centavos por defecto y limpia el ruido de punto flotante", () => {
    expect(roundTo(0.1 + 0.2)).toBe(0.3);
    expect(roundTo(37541.666666)).toBe(37541.67);
  });

  it("acepta otra cantidad de decimales", () => {
    expect(roundTo(1.2345, 3)).toBe(1.235);
    expect(roundTo(1.5, 0)).toBe(2);
  });
});

describe("fraction", () => {
  it("divide, y devuelve null si el total es 0 (nunca NaN o Infinity)", () => {
    expect(fraction(5, 14)).toBeCloseTo(0.357, 3);
    expect(fraction(0, 14)).toBe(0);
    expect(fraction(3, 0)).toBeNull();
  });
});

describe("compare", () => {
  it("devuelve la base, la diferencia y la variación relativa", () => {
    expect(compare(150, 100)).toEqual({ base: 100, diff: 50, pct: 0.5 });
    expect(compare(75, 100)).toEqual({ base: 100, diff: -25, pct: -0.25 });
  });

  it("sin variación relativa cuando la base es 0 (no existe «+X %» sobre cero)", () => {
    expect(compare(5, 0)).toEqual({ base: 0, diff: 5, pct: null });
  });
});

describe("compareAt", () => {
  it("compara con el anterior y con el promedio de los OTROS (sin contar al propio)", () => {
    const r = compareAt([10, 20, 60], 2);
    expect(r.value).toBe(60);
    expect(r.vsPrevious).toEqual({ base: 20, diff: 40, pct: 2 });
    // promedio de los otros: (10 + 20) / 2 = 15. Con el propio incluido sería 30.
    expect(r.vsAverage).toEqual({ base: 15, diff: 45, pct: 3 });
    expect(r.others).toBe(2);
    expect(r.previousIndex).toBe(1);
  });

  it("el primero no tiene anterior pero sí promedio de los siguientes", () => {
    const r = compareAt([10, 20, 30], 0);
    expect(r.vsPrevious).toBeNull();
    expect(r.previousIndex).toBeNull();
    expect(r.vsAverage?.base).toBe(25);
  });

  it("saltea los eventos sin dato (null): ni cuentan como cero ni como base", () => {
    const r = compareAt([100, null, 50], 2);
    expect(r.previousIndex).toBe(0);
    expect(r.vsPrevious).toEqual({ base: 100, diff: -50, pct: -0.5 });
    expect(r.vsAverage?.base).toBe(100);
    expect(r.others).toBe(1);
  });

  it("si el propio punto no tiene dato, no compara nada", () => {
    expect(compareAt([10, null, 30], 1)).toEqual({
      value: null,
      vsPrevious: null,
      vsAverage: null,
      previousIndex: null,
      others: 0,
    });
  });

  it("con un solo punto no hay con qué comparar", () => {
    const r = compareAt([42], 0);
    expect(r.value).toBe(42);
    expect(r.vsPrevious).toBeNull();
    expect(r.vsAverage).toBeNull();
    expect(r.others).toBe(0);
  });

  it("un índice fuera de la serie se trata como sin dato", () => {
    expect(compareAt([1, 2], 5).value).toBeNull();
  });
});

describe("summarizeSeries", () => {
  it("serie vacía: todo null y n = 0", () => {
    expect(summarizeSeries([])).toEqual({
      n: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
      latest: null,
      vsPrevious: null,
      vsAverage: null,
    });
  });

  it("resume y compara el último punto con el anterior y con el promedio del resto", () => {
    const s = summarizeSeries([6, 5, 5]);
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(5.333, 3);
    expect(s.median).toBe(5);
    expect(s.min).toBe(5);
    expect(s.max).toBe(6);
    expect(s.latest).toBe(5);
    expect(s.vsPrevious).toEqual({ base: 5, diff: 0, pct: 0 });
    expect(s.vsAverage).toEqual({ base: 5.5, diff: -0.5, pct: -0.5 / 5.5 });
  });

  it("ignora los nulls al final: el «último» es el último con dato", () => {
    const s = summarizeSeries([10, 30, null]);
    expect(s.n).toBe(2);
    expect(s.latest).toBe(30);
    expect(s.vsPrevious?.base).toBe(10);
  });

  it("con un solo dato resume pero no compara", () => {
    const s = summarizeSeries([null, 8]);
    expect(s.n).toBe(1);
    expect(s.latest).toBe(8);
    expect(s.median).toBe(8);
    expect(s.vsPrevious).toBeNull();
    expect(s.vsAverage).toBeNull();
  });
});
