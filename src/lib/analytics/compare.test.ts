import { describe, expect, it } from "vitest";
import { restMedian, similarOthers, windowAround, type ComparePoint } from "./compare";

const point = (id: string, hasFutbol: boolean, over: Partial<ComparePoint> = {}): ComparePoint => ({
  id,
  hasFutbol,
  confirmed: 0,
  ratio: null,
  total: null,
  costPerPerson: null,
  ...over,
});

const points: ComparePoint[] = [
  point("a", true, { confirmed: 6, total: 300 }),
  point("b", true, { confirmed: 5, total: 100 }),
  point("c", false, { confirmed: 5, total: 200 }),
  point("d", true, { confirmed: 9, total: null }),
];

describe("similarOthers", () => {
  it("los del mismo tipo (con o sin fútbol), sin contar al propio", () => {
    expect(similarOthers(points, "a").map((p) => p.id)).toEqual(["b", "d"]);
    expect(similarOthers(points, "c").map((p) => p.id)).toEqual([]);
  });

  it("un evento que no está en la lista no tiene similares", () => {
    expect(similarOthers(points, "zz")).toEqual([]);
  });
});

describe("restMedian", () => {
  it("todos: la mediana de los OTROS (sin el propio) y cuántos son", () => {
    // otros de a: b 5, c 5, d 9 → mediana 5
    expect(restMedian(points, "confirmed", "a", "all")).toEqual({ median: 5, n: 3 });
  });

  it("con cantidad par de otros, el promedio de los dos del medio", () => {
    // otros de d: a 6, b 5, c 5 → mediana 5; otros de c: a 6, b 5, d 9 → 6
    expect(restMedian(points, "confirmed", "c", "all")).toEqual({ median: 6, n: 3 });
    expect(restMedian(points.slice(0, 3), "confirmed", "c", "all")).toEqual({ median: 5.5, n: 2 });
  });

  it("no cuenta los eventos sin dato (null) ni como cero ni en n", () => {
    // total de los otros de a: b 100, c 200, d null → mediana 150, n 2
    expect(restMedian(points, "total", "a", "all")).toEqual({ median: 150, n: 2 });
  });

  it("similares: solo del mismo tipo", () => {
    expect(restMedian(points, "confirmed", "a", "similar")).toEqual({ median: 7, n: 2 });
    expect(restMedian(points, "total", "a", "similar")).toEqual({ median: 100, n: 1 });
  });

  it("sin con qué comparar: mediana null y n 0", () => {
    expect(restMedian(points, "confirmed", "c", "similar")).toEqual({ median: null, n: 0 });
    expect(restMedian([point("solo", true)], "confirmed", "solo", "all")).toEqual({ median: null, n: 0 });
    expect(restMedian(points, "ratio", "a", "all")).toEqual({ median: null, n: 0 });
  });
});

describe("windowAround", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);

  it("si entran todos, devuelve todos", () => {
    expect(windowAround([1, 2, 3], 1, 8)).toEqual([1, 2, 3]);
    expect(windowAround(items.slice(0, 8), 7, 8)).toEqual(items.slice(0, 8));
  });

  it("centra la ventana en el elemento: anteriores y posteriores", () => {
    expect(windowAround(items, 6, 8)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("en los bordes la ventana no se sale de la lista", () => {
    expect(windowAround(items, 0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(windowAround(items, 11, 8)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(windowAround(items, 1, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("siempre incluye al elemento pedido", () => {
    for (let i = 0; i < items.length; i++) {
      expect(windowAround(items, i, 8)).toContain(i);
      expect(windowAround(items, i, 8)).toHaveLength(8);
    }
  });

  it("con un índice fuera de rango toma los últimos", () => {
    expect(windowAround(items, -1, 4)).toEqual([8, 9, 10, 11]);
    expect(windowAround(items, 99, 4)).toEqual([8, 9, 10, 11]);
  });

  it("no modifica la lista original", () => {
    const original = [1, 2, 3];
    windowAround(original, 0, 8).push(9);
    expect(original).toEqual([1, 2, 3]);
  });
});
