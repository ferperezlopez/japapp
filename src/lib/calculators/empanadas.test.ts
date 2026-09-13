import { describe, expect, it } from "vitest";
import { EMPANADA_ITEMS, calcularEmpanadas } from "./empanadas";

describe("calcularEmpanadas", () => {
  it("devuelve [] para 0 docenas", () => {
    expect(calcularEmpanadas(0)).toEqual([]);
  });

  it("devuelve [] para un número negativo", () => {
    expect(calcularEmpanadas(-2)).toEqual([]);
  });

  it("devuelve [] para NaN", () => {
    expect(calcularEmpanadas(NaN)).toEqual([]);
  });

  it("devuelve [] para Infinity", () => {
    expect(calcularEmpanadas(Infinity)).toEqual([]);
  });

  it("calcula la cantidad de cada ítem para un número entero de docenas", () => {
    const result = calcularEmpanadas(2);
    expect(result).toHaveLength(EMPANADA_ITEMS.length);

    expect(result.find((r) => r.key === "bolaDeLomo")?.cantidad).toBe(1500);
    expect(result.find((r) => r.key === "morron")?.cantidad).toBe(1);
    expect(result.find((r) => r.key === "huevos")?.cantidad).toBe(5);
  });

  it("preserva el flag indent de aguaCalditos", () => {
    const result = calcularEmpanadas(1);
    const aguaCalditos = result.find((r) => r.key === "aguaCalditos");
    expect(aguaCalditos?.indent).toBe(true);
    // Un ítem sin indent no debería tener el flag en true.
    expect(result.find((r) => r.key === "cebolla")?.indent).toBeUndefined();
  });

  it("acepta cantidades fraccionarias de docenas", () => {
    const result = calcularEmpanadas(1.5);
    const chardonay = result.find((r) => r.key === "chardonay");
    expect(chardonay?.cantidad).toBe(187.5);
  });

  it("no arrastra artefactos de floating point tras el redondeo", () => {
    const result = calcularEmpanadas(0.1);
    const aceitunas = result.find((r) => r.key === "aceitunas");
    expect(aceitunas?.cantidad).toBe(2.7);
  });
});
