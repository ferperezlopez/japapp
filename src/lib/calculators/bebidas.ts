export interface BebidaItem {
  key: DrinkKey;
  label: string;
  perPersona: number;
  unit: string;
  icon: string;
}

// Los tres tipos de bebida que se calculan y que se pueden registrar en un
// evento (event_drinks, migración 0047): mismas claves en los dos lados.
export const DRINK_KEYS = ["vino", "cerveza", "gaseosa"] as const;
export type DrinkKey = (typeof DRINK_KEYS)[number];

// Factores per cápita de la planilla de bebidas del grupo: 0,5 botellas de
// vino, 0,75 L de cerveza y 0,5 L de gaseosa por persona.
// (La calculadora de asado trae sus propios factores de vino y gaseosa, 0,4,
// sacados de la planilla del asado; no se tocan, ver specs/001-calculadoras.md.)
export const BEBIDAS_ITEMS: BebidaItem[] = [
  { key: "vino", label: "Vino", perPersona: 0.5, unit: "botellas", icon: "🍷" },
  { key: "cerveza", label: "Cerveza", perPersona: 0.75, unit: "L", icon: "🍺" },
  { key: "gaseosa", label: "Gaseosa", perPersona: 0.5, unit: "L", icon: "🥤" },
];

export interface BebidaResultItem extends BebidaItem {
  cantidad: number;
}

export function calcularBebidas(personas: number): BebidaResultItem[] {
  if (!Number.isFinite(personas) || personas <= 0) return [];

  return BEBIDAS_ITEMS.map((item) => ({
    ...item,
    cantidad: roundTo(item.perPersona * personas, 2),
  }));
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
