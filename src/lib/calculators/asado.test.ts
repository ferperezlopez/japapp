import { describe, expect, it } from "vitest";
import { ASADO_ITEMS, calcularAsado } from "./asado";

describe("calcularAsado", () => {
  it("devuelve [] para 0 participantes", () => {
    expect(calcularAsado(0)).toEqual([]);
  });

  it("devuelve [] para un número negativo", () => {
    expect(calcularAsado(-5)).toEqual([]);
  });

  it("devuelve [] para NaN", () => {
    expect(calcularAsado(NaN)).toEqual([]);
  });

  it("devuelve [] para Infinity", () => {
    expect(calcularAsado(Infinity)).toEqual([]);
  });

  it("calcula la cantidad de cada ítem para un número entero de participantes", () => {
    const result = calcularAsado(10);
    expect(result).toHaveLength(ASADO_ITEMS.length);

    const carneSinHueso = result.find((r) => r.key === "carneSinHueso");
    expect(carneSinHueso?.cantidad).toBe(5);

    const carbon = result.find((r) => r.key === "carbon");
    expect(carbon?.cantidad).toBe(7.5);
  });

  it("preserva label y unit de cada ítem original", () => {
    const result = calcularAsado(4);
    const chori = result.find((r) => r.key === "chori");
    expect(chori?.label).toBe("Chorizos");
    expect(chori?.unit).toBe("u");
  });

  it("acepta cantidades fraccionarias de participantes", () => {
    const result = calcularAsado(2.5);
    const vino = result.find((r) => r.key === "vino");
    expect(vino?.cantidad).toBe(1);
  });

  it("no arrastra artefactos de floating point tras el redondeo", () => {
    const result = calcularAsado(3);
    const picada = result.find((r) => r.key === "picada");
    // 0.1 * 3 en JS crudo da 0.30000000000000004
    expect(picada?.cantidad).toBe(0.3);
  });
});
