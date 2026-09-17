import { describe, expect, it } from "vitest";
import {
  findSimilarItem,
  iconForInsumo,
  matchesQuery,
  normalize,
  similarity,
} from "./insumos";

describe("normalize", () => {
  it("saca tildes y pasa a minúsculas", () => {
    expect(normalize("Carbón")).toBe("carbon");
    expect(normalize("  Cerveza  ")).toBe("cerveza");
  });
});

describe("iconForInsumo", () => {
  it("devuelve el ícono si el nombre contiene una palabra clave", () => {
    expect(iconForInsumo("Carne sin hueso")).toBe("🥩");
    expect(iconForInsumo("Cerveza")).toBe("🍺");
    expect(iconForInsumo("Carbón")).toBe("🔥");
  });

  it("no distingue mayúsculas ni tildes", () => {
    expect(iconForInsumo("CARBON")).toBe("🔥");
  });

  it("devuelve null si ninguna palabra clave matchea", () => {
    expect(iconForInsumo("Servilletas de papel especiales")).not.toBeNull();
    expect(iconForInsumo("Cosa random sin categoría")).toBeNull();
  });
});

describe("matchesQuery", () => {
  it("un query vacío matchea cualquier cosa", () => {
    expect(matchesQuery("Vino", "")).toBe(true);
  });

  it("matchea por substring sin importar mayúsculas/tildes", () => {
    expect(matchesQuery("Carbón", "carbon")).toBe(true);
    expect(matchesQuery("Cerveza", "cerv")).toBe(true);
  });

  it("no matchea si no hay substring en común", () => {
    expect(matchesQuery("Vino", "cerveza")).toBe(false);
  });
});

describe("similarity", () => {
  it("es 1 para strings idénticos", () => {
    expect(similarity("Cerveza", "Cerveza")).toBe(1);
  });

  it("es alta para variantes de tildeo/plural", () => {
    expect(similarity("Cerveza", "cervezas")).toBeGreaterThan(0.6);
  });

  it("es baja para strings sin relación", () => {
    expect(similarity("Cerveza", "Papas fritas")).toBeLessThan(0.2);
  });
});

describe("findSimilarItem", () => {
  const items = [
    { id: "1", name: "Cerveza" },
    { id: "2", name: "Papas fritas" },
  ];

  it("sugiere el existente más parecido por encima del umbral", () => {
    expect(findSimilarItem(items, "cervezas")).toEqual(items[0]);
  });

  it("devuelve null si nada supera el umbral", () => {
    expect(findSimilarItem(items, "Hielo")).toBeNull();
  });

  it("devuelve null con lista vacía", () => {
    expect(findSimilarItem([], "Cerveza")).toBeNull();
  });
});
