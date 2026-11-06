import { describe, expect, it } from "vitest";
import {
  capitalizeFirst,
  findSimilarItem,
  iconForInsumo,
  MAX_QUANTITY_LENGTH,
  matchesQuery,
  normalize,
  normalizeQuantity,
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

describe("capitalizeFirst", () => {
  it("pone en mayúscula solo la primera letra", () => {
    expect(capitalizeFirst("servilletas")).toBe("Servilletas");
    expect(capitalizeFirst("coca COLA")).toBe("Coca COLA");
    expect(capitalizeFirst("carne para el asado")).toBe("Carne para el asado");
  });

  it("también con tilde y con la ñ", () => {
    expect(capitalizeFirst("ñoquis")).toBe("Ñoquis");
    expect(capitalizeFirst("épico")).toBe("Épico");
  });

  it("deja igual lo que ya empieza con mayúscula", () => {
    expect(capitalizeFirst("Hielo")).toBe("Hielo");
    expect(capitalizeFirst("HIELO")).toBe("HIELO");
  });

  it("recorta los espacios de los costados antes de elegir la primera letra", () => {
    expect(capitalizeFirst("  pan fresco ")).toBe("Pan fresco");
  });

  it("lo que no empieza con letra queda igual", () => {
    expect(capitalizeFirst("7up")).toBe("7up");
    expect(capitalizeFirst("🍺 cerveza")).toBe("🍺 cerveza");
  });

  it("un texto vacío o de espacios queda vacío", () => {
    expect(capitalizeFirst("")).toBe("");
    expect(capitalizeFirst("   ")).toBe("");
  });
});

describe("normalizeQuantity", () => {
  it("sin nada (o solo espacios) es «sin cantidad»", () => {
    expect(normalizeQuantity(undefined)).toEqual({ value: null });
    expect(normalizeQuantity(null)).toEqual({ value: null });
    expect(normalizeQuantity("")).toEqual({ value: null });
    expect(normalizeQuantity("   \t ")).toEqual({ value: null });
  });

  it("recorta los costados y deja los espacios del medio en uno", () => {
    expect(normalizeQuantity("  2 kg ")).toEqual({ value: "2 kg" });
    expect(normalizeQuantity("3   litros\n de  coca")).toEqual({ value: "3 litros de coca" });
  });

  it("no toca mayúsculas, números ni signos", () => {
    expect(normalizeQuantity("x6")).toEqual({ value: "x6" });
    expect(normalizeQuantity("2,5 Kg (aprox.)")).toEqual({ value: "2,5 Kg (aprox.)" });
  });

  it("acepta hasta el tope y rechaza uno más", () => {
    expect(MAX_QUANTITY_LENGTH).toBe(40);
    expect(normalizeQuantity("x".repeat(MAX_QUANTITY_LENGTH))).toEqual({
      value: "x".repeat(MAX_QUANTITY_LENGTH),
    });
    expect(normalizeQuantity("x".repeat(MAX_QUANTITY_LENGTH + 1))).toEqual({
      error: "La cantidad es muy larga (máximo 40 caracteres).",
    });
  });

  it("el tope cuenta caracteres, no unidades de UTF-16 (un emoji cuenta uno)", () => {
    expect(normalizeQuantity("🍺".repeat(MAX_QUANTITY_LENGTH))).toEqual({
      value: "🍺".repeat(MAX_QUANTITY_LENGTH),
    });
    expect(normalizeQuantity("🍺".repeat(MAX_QUANTITY_LENGTH + 1))).toHaveProperty("error");
  });

  it("el tope se mide después de recortar y juntar los espacios", () => {
    expect(normalizeQuantity(`  ${"x".repeat(MAX_QUANTITY_LENGTH)}  `)).toEqual({
      value: "x".repeat(MAX_QUANTITY_LENGTH),
    });
    expect(normalizeQuantity("a" + " ".repeat(50) + "b")).toEqual({ value: "a b" });
  });
});
