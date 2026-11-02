import { BEBIDAS_ITEMS, DRINK_KEYS, type DrinkKey } from "@/lib/calculators/bebidas";

// Bebidas de un evento (event_drinks, migración 0047): lo que se compró y lo que
// se consumió realmente, por tipo. Las dos cantidades son opcionales.
export interface DrinkAmounts {
  bought: number | null;
  consumed: number | null;
}

export type DrinksInput = Record<DrinkKey, DrinkAmounts>;

/** Tope razonable (la columna admite hasta 99.999,99): un error de tipeo, no una cantidad real. */
export const MAX_DRINK_AMOUNT = 9999.99;

export type DrinksParseResult =
  | { ok: true; amounts: DrinksInput }
  | { ok: false; error: string };

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "" → null (sin dato); acepta coma o punto decimal. `undefined` si no es un número válido. */
function parseOne(raw: FormDataEntryValue | null): number | null | undefined {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > MAX_DRINK_AMOUNT) return undefined;
  return roundTo2(value);
}

/**
 * Lee los campos `bought_<tipo>` y `consumed_<tipo>` del formulario de bebidas
 * del evento. Un campo vacío es «sin dato», no cero.
 */
export function parseDrinksForm(formData: FormData): DrinksParseResult {
  const amounts = {} as DrinksInput;
  for (const key of DRINK_KEYS) {
    const bought = parseOne(formData.get(`bought_${key}`));
    const consumed = parseOne(formData.get(`consumed_${key}`));
    if (bought === undefined || consumed === undefined) {
      const label = BEBIDAS_ITEMS.find((item) => item.key === key)?.label ?? key;
      return {
        ok: false,
        error: `Revisá las cantidades de ${label.toLowerCase()}: tienen que ser números de 0 en adelante.`,
      };
    }
    amounts[key] = { bought, consumed };
  }
  return { ok: true, amounts };
}

/** Una fila de event_drinks solo existe si tiene alguna cantidad. */
export function hasAnyAmount(amounts: DrinkAmounts): boolean {
  return amounts.bought !== null || amounts.consumed !== null;
}

/** Lo consumido por persona (con 2 decimales), o null si falta el dato o no hay gente. */
export function perPerson(amount: number | null, people: number): number | null {
  if (amount === null || !Number.isFinite(people) || people <= 0) return null;
  return roundTo2(amount / people);
}

/** Lo que sobró (comprado − consumido), o null si falta alguno de los dos. Puede dar negativo. */
export function leftover(amounts: DrinkAmounts): number | null {
  if (amounts.bought === null || amounts.consumed === null) return null;
  return roundTo2(amounts.bought - amounts.consumed);
}

/** Lo guardado en event_drinks, completado con «sin dato» para los tipos sin fila. */
export function drinksFromRows(
  rows: readonly { drink: string; bought: number | null; consumed: number | null }[],
): DrinksInput {
  const result = {} as DrinksInput;
  for (const key of DRINK_KEYS) {
    const row = rows.find((r) => r.drink === key);
    result[key] = { bought: row?.bought ?? null, consumed: row?.consumed ?? null };
  }
  return result;
}
