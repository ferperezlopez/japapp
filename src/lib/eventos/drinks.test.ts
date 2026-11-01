import { describe, expect, it } from "vitest";
import {
  MAX_DRINK_AMOUNT,
  drinksFromRows,
  hasAnyAmount,
  leftover,
  parseDrinksForm,
  perPerson,
} from "./drinks";

function formWith(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("parseDrinksForm", () => {
  it("un formulario vacío es «sin dato» en todo, no ceros", () => {
    const result = parseDrinksForm(formWith({}));
    expect(result).toEqual({
      ok: true,
      amounts: {
        vino: { bought: null, consumed: null },
        cerveza: { bought: null, consumed: null },
        gaseosa: { bought: null, consumed: null },
      },
    });
  });

  it("lee lo comprado y lo consumido de cada tipo", () => {
    const result = parseDrinksForm(
      formWith({
        bought_vino: "6",
        consumed_vino: "4",
        bought_cerveza: "12.5",
        consumed_gaseosa: "3",
      }),
    );
    expect(result).toEqual({
      ok: true,
      amounts: {
        vino: { bought: 6, consumed: 4 },
        cerveza: { bought: 12.5, consumed: null },
        gaseosa: { bought: null, consumed: 3 },
      },
    });
  });

  it("acepta coma como separador decimal y redondea a 2 decimales", () => {
    const result = parseDrinksForm(formWith({ bought_cerveza: "7,5", consumed_cerveza: "5.456" }));
    expect(result.ok && result.amounts.cerveza).toEqual({ bought: 7.5, consumed: 5.46 });
  });

  it("un cero es un dato (se tomó 0), distinto de dejarlo vacío", () => {
    const result = parseDrinksForm(formWith({ consumed_vino: "0" }));
    expect(result.ok && result.amounts.vino).toEqual({ bought: null, consumed: 0 });
  });

  it("ignora los espacios", () => {
    const result = parseDrinksForm(formWith({ bought_vino: "  3  ", consumed_vino: "   " }));
    expect(result.ok && result.amounts.vino).toEqual({ bought: 3, consumed: null });
  });

  it.each([
    ["negativa", "-1"],
    ["con letras", "mucho"],
    ["infinita", "Infinity"],
    ["pasada del tope", String(MAX_DRINK_AMOUNT + 1)],
  ])("rechaza una cantidad %s y nombra la bebida", (_name, value) => {
    const result = parseDrinksForm(formWith({ consumed_cerveza: value }));
    expect(result).toEqual({
      ok: false,
      error: "Revisá las cantidades de cerveza: tienen que ser números de 0 en adelante.",
    });
  });

  it("acepta justo el tope", () => {
    const result = parseDrinksForm(formWith({ bought_gaseosa: String(MAX_DRINK_AMOUNT) }));
    expect(result.ok && result.amounts.gaseosa.bought).toBe(MAX_DRINK_AMOUNT);
  });
});

describe("hasAnyAmount", () => {
  it("es verdadero si hay al menos una cantidad, aunque sea 0", () => {
    expect(hasAnyAmount({ bought: null, consumed: null })).toBe(false);
    expect(hasAnyAmount({ bought: 0, consumed: null })).toBe(true);
    expect(hasAnyAmount({ bought: null, consumed: 2 })).toBe(true);
  });
});

describe("perPerson", () => {
  it("divide lo consumido por la gente, con 2 decimales", () => {
    expect(perPerson(4, 10)).toBe(0.4);
    expect(perPerson(7.5, 8)).toBe(0.94); // 0,9375
  });

  it("es null sin dato o sin gente", () => {
    expect(perPerson(null, 10)).toBeNull();
    expect(perPerson(4, 0)).toBeNull();
    expect(perPerson(4, NaN)).toBeNull();
  });
});

describe("leftover", () => {
  it("es lo comprado menos lo consumido", () => {
    expect(leftover({ bought: 6, consumed: 4 })).toBe(2);
    expect(leftover({ bought: 7.5, consumed: 5.25 })).toBe(2.25);
  });

  it("puede dar negativo si se tomó más de lo anotado como comprado", () => {
    expect(leftover({ bought: 3, consumed: 4 })).toBe(-1);
  });

  it("es null si falta alguno de los dos", () => {
    expect(leftover({ bought: 6, consumed: null })).toBeNull();
    expect(leftover({ bought: null, consumed: 4 })).toBeNull();
  });
});

describe("drinksFromRows", () => {
  it("completa con «sin dato» los tipos que no tienen fila y ordena por tipo", () => {
    expect(
      drinksFromRows([
        { drink: "gaseosa", bought: 5, consumed: null },
        { drink: "vino", bought: 6, consumed: 4 },
      ]),
    ).toEqual({
      vino: { bought: 6, consumed: 4 },
      cerveza: { bought: null, consumed: null },
      gaseosa: { bought: 5, consumed: null },
    });
  });

  it("ignora tipos que no son de la lista", () => {
    expect(drinksFromRows([{ drink: "fernet", bought: 1, consumed: 1 }]).vino).toEqual({
      bought: null,
      consumed: null,
    });
  });
});
