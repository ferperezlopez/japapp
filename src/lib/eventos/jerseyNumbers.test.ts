import { describe, expect, it } from "vitest";
import { assignJerseyNumbers } from "./jerseyNumbers";

describe("assignJerseyNumbers", () => {
  it("el arquero (primer grupo) siempre es 1", () => {
    const numbers = assignJerseyNumbers([
      [{ userId: "gk" }],
      [{ userId: "def1" }, { userId: "def2" }],
      [{ userId: "fwd1" }],
    ]);
    expect(numbers.get("gk")).toBe(1);
  });

  it("numera correlativo y continuo entre grupos", () => {
    const numbers = assignJerseyNumbers([
      [{ userId: "gk" }],
      [{ userId: "def1" }, { userId: "def2" }],
      [{ userId: "fwd1" }],
    ]);
    expect(numbers.get("def1")).toBe(2);
    expect(numbers.get("def2")).toBe(3);
    expect(numbers.get("fwd1")).toBe(4);
  });

  it("grupos vacíos no dejan huecos en la numeración", () => {
    const numbers = assignJerseyNumbers([
      [{ userId: "gk" }],
      [],
      [{ userId: "fwd1" }],
    ]);
    expect(numbers.get("gk")).toBe(1);
    expect(numbers.get("fwd1")).toBe(2);
  });

  it("dos equipos numeran independiente (llamadas separadas)", () => {
    const team1 = assignJerseyNumbers([[{ userId: "a" }], [{ userId: "b" }]]);
    const team2 = assignJerseyNumbers([[{ userId: "c" }], [{ userId: "d" }]]);
    expect(team1.get("a")).toBe(1);
    expect(team2.get("c")).toBe(1);
  });

  it("sin jugadores devuelve un mapa vacío", () => {
    expect(assignJerseyNumbers([[], [], []]).size).toBe(0);
  });
});
