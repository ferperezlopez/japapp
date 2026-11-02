import { describe, expect, it } from "vitest";
import { balanceUniverse } from "./attendees";

const base = {
  linkedToEvent: true,
  confirmedIds: [] as string[],
  memberIds: [] as string[],
  expenses: [] as { paidBy: string; shares: { userId: string }[] }[],
  payments: [] as { from: string; to: string }[],
};

const sorted = (ids: Set<string>) => [...ids].sort();

describe("balanceUniverse", () => {
  it("con evento: solo quienes confirmaron, aunque el grupo tenga más miembros", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana", "beto"],
      memberIds: ["ana", "beto", "carla", "dani"],
    });
    expect(sorted(ids)).toEqual(["ana", "beto"]);
  });

  it("con evento: un miembro que nunca confirmó y no tiene plata no aparece", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana"],
      memberIds: ["ana", "carla"],
    });
    expect(ids.has("carla")).toBe(false);
  });

  it("con evento: quien pagó un gasto aparece aunque no haya confirmado", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana"],
      expenses: [{ paidBy: "carla", shares: [{ userId: "ana" }] }],
    });
    expect(sorted(ids)).toEqual(["ana", "carla"]);
  });

  it("con evento: quien tiene una parte aparece aunque no haya confirmado", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana"],
      expenses: [{ paidBy: "ana", shares: [{ userId: "ana" }, { userId: "dani" }] }],
    });
    expect(sorted(ids)).toEqual(["ana", "dani"]);
  });

  it("con evento: quien hizo o recibió un pago aparece aunque no haya confirmado", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana"],
      payments: [{ from: "beto", to: "carla" }],
    });
    expect(sorted(ids)).toEqual(["ana", "beto", "carla"]);
  });

  it("con evento y sin nadie confirmado: queda vacío", () => {
    expect(balanceUniverse({ ...base, memberIds: ["ana"] }).size).toBe(0);
  });

  it("grupo suelto: los miembros, como siempre, y no los «confirmados»", () => {
    const ids = balanceUniverse({
      ...base,
      linkedToEvent: false,
      confirmedIds: ["zeta"],
      memberIds: ["ana", "beto"],
    });
    expect(sorted(ids)).toEqual(["ana", "beto"]);
  });

  it("grupo suelto: también suma a quien tenga plata sin ser miembro", () => {
    const ids = balanceUniverse({
      ...base,
      linkedToEvent: false,
      memberIds: ["ana"],
      expenses: [{ paidBy: "ana", shares: [{ userId: "beto" }] }],
    });
    expect(sorted(ids)).toEqual(["ana", "beto"]);
  });

  it("no repite a nadie", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: ["ana", "ana", "beto"],
      expenses: [{ paidBy: "ana", shares: [{ userId: "ana" }, { userId: "beto" }] }],
      payments: [{ from: "beto", to: "ana" }],
    });
    expect(ids.size).toBe(2);
  });

  it("acepta cualquier iterable (un Set de confirmados)", () => {
    const ids = balanceUniverse({
      ...base,
      confirmedIds: new Set(["ana", "beto"]),
    });
    expect(sorted(ids)).toEqual(["ana", "beto"]);
  });
});
