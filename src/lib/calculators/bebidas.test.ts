import { describe, expect, it } from "vitest";
import { BEBIDAS_ITEMS, DRINK_KEYS, calcularBebidas } from "./bebidas";

describe("calcularBebidas", () => {
  it("devuelve [] para 0 personas", () => {
    expect(calcularBebidas(0)).toEqual([]);
  });

  it("devuelve [] para un número negativo", () => {
    expect(calcularBebidas(-5)).toEqual([]);
  });

  it("devuelve [] para NaN e Infinity", () => {
    expect(calcularBebidas(NaN)).toEqual([]);
    expect(calcularBebidas(Infinity)).toEqual([]);
  });

  it("usa los factores de la planilla: vino 0,5 botellas, cerveza 0,75 L y gaseosa 0,5 L por persona", () => {
    expect(BEBIDAS_ITEMS.map((i) => [i.key, i.perPersona, i.unit])).toEqual([
      ["vino", 0.5, "botellas"],
      ["cerveza", 0.75, "L"],
      ["gaseosa", 0.5, "L"],
    ]);
  });

  it("calcula la cantidad de cada bebida para 10 personas", () => {
    const result = calcularBebidas(10);
    expect(result.map((r) => [r.key, r.cantidad])).toEqual([
      ["vino", 5],
      ["cerveza", 7.5],
      ["gaseosa", 5],
    ]);
  });

  it("para una sola persona devuelve los factores tal cual", () => {
    expect(calcularBebidas(1).map((r) => r.cantidad)).toEqual([0.5, 0.75, 0.5]);
  });

  it("preserva label, unidad e ícono de cada ítem", () => {
    const vino = calcularBebidas(4).find((r) => r.key === "vino");
    expect(vino).toMatchObject({ label: "Vino", unit: "botellas", icon: "🍷", cantidad: 2 });
  });

  it("acepta cantidades fraccionarias de personas", () => {
    const cerveza = calcularBebidas(2.5).find((r) => r.key === "cerveza");
    expect(cerveza?.cantidad).toBe(1.88); // 1,875 redondeado a 2 decimales
  });

  it("redondea a 2 decimales y no arrastra artefactos de floating point", () => {
    // 0.75 * 1.1 en JS crudo da 0.8250000000000001
    expect(calcularBebidas(1.1).find((r) => r.key === "cerveza")?.cantidad).toBe(0.83);
    expect(calcularBebidas(7).find((r) => r.key === "cerveza")?.cantidad).toBe(5.25);
  });

  it("los tipos de bebida son los mismos que se guardan en el evento", () => {
    expect(BEBIDAS_ITEMS.map((i) => i.key)).toEqual([...DRINK_KEYS]);
  });
});
