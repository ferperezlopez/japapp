import { describe, expect, it } from "vitest";
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from "./displayName";

describe("normalizeDisplayName", () => {
  it("recorta los espacios de los bordes", () => {
    expect(normalizeDisplayName("  Fernando Pérez  ")).toEqual({
      name: "Fernando Pérez",
    });
  });

  it("colapsa los espacios internos repetidos", () => {
    expect(normalizeDisplayName("Fernando    Pérez   López")).toEqual({
      name: "Fernando Pérez López",
    });
  });

  it("conserva tildes, ñ y mayúsculas tal cual", () => {
    expect(normalizeDisplayName("Ñandú Gómez")).toEqual({ name: "Ñandú Gómez" });
  });

  it("rechaza un nombre vacío", () => {
    expect(normalizeDisplayName("")).toEqual({ error: "Ingresá tu nombre." });
  });

  it("rechaza un nombre de solo espacios", () => {
    expect(normalizeDisplayName("    ")).toEqual({ error: "Ingresá tu nombre." });
  });

  it("acepta un nombre justo en el máximo", () => {
    const name = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(normalizeDisplayName(name)).toEqual({ name });
  });

  it("rechaza un nombre que pasa el máximo", () => {
    const result = normalizeDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1));
    expect(result).toEqual({
      error: `El nombre no puede superar los ${MAX_DISPLAY_NAME_LENGTH} caracteres.`,
    });
  });

  it("mide el largo después de normalizar, no antes", () => {
    const padded = `  ${"a".repeat(MAX_DISPLAY_NAME_LENGTH)}  `;
    expect(normalizeDisplayName(padded)).toEqual({
      name: "a".repeat(MAX_DISPLAY_NAME_LENGTH),
    });
  });
});
