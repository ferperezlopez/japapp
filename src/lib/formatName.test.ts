import { describe, expect, it } from "vitest";
import { abbreviateName, initialsFrom } from "./formatName";

describe("abbreviateName", () => {
  it("inicial del nombre y primer apellido", () => {
    expect(abbreviateName("Fernando Pérez López")).toBe("F. Pérez");
  });

  it("con una sola palabra, esa palabra; sin nada, vacío", () => {
    expect(abbreviateName("Javi")).toBe("Javi");
    expect(abbreviateName("   ")).toBe("");
  });
});

describe("initialsFrom", () => {
  it("la inicial del nombre y la del último apellido, en mayúsculas", () => {
    expect(initialsFrom("fernando pérez lópez")).toBe("FL");
    expect(initialsFrom("Javi Gómez")).toBe("JG");
  });

  it("con una sola palabra, una sola inicial", () => {
    expect(initialsFrom("nico")).toBe("N");
  });

  it("ignora los espacios de más", () => {
    expect(initialsFrom("  Ari   Ruiz  ")).toBe("AR");
  });

  it("sin nombre, «?»", () => {
    expect(initialsFrom(null)).toBe("?");
    expect(initialsFrom(undefined)).toBe("?");
    expect(initialsFrom("")).toBe("?");
    expect(initialsFrom("   ")).toBe("?");
  });
});
