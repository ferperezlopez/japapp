export interface AsadoItem {
  key: string;
  label: string;
  perPersona: number;
  unit: string;
  icon: string;
}

// Factores per cápita extraídos de la planilla de Google Sheets del grupo.
export const ASADO_ITEMS: AsadoItem[] = [
  { key: "carneSinHueso", label: "Carne sin hueso", perPersona: 0.5, unit: "kg", icon: "🥩" },
  { key: "carneConHueso", label: "Carne con hueso", perPersona: 0.75, unit: "kg", icon: "🍖" },
  { key: "chori", label: "Chorizos", perPersona: 0.5, unit: "u", icon: "🌭" },
  { key: "vino", label: "Vino", perPersona: 0.4, unit: "botellas", icon: "🍷" },
  { key: "cerveza", label: "Cerveza", perPersona: 0.75, unit: "L", icon: "🍺" },
  { key: "gaseosa", label: "Gaseosa", perPersona: 0.4, unit: "L", icon: "🥤" },
  { key: "pan", label: "Pan", perPersona: 0.15, unit: "kg", icon: "🍞" },
  { key: "carbon", label: "Carbón", perPersona: 0.75, unit: "kg", icon: "🔥" },
  { key: "picada", label: "Picada", perPersona: 0.1, unit: "kg", icon: "🧀" },
  { key: "papasFritas", label: "Papas fritas", perPersona: 0.15, unit: "kg", icon: "🍟" },
];

// Receta base de ensalada criolla, no escala 1:1 con la cantidad de gente:
// duplicar/triplicar la receta para grupos grandes.
export const CRIOLLA_BASE = [
  "1 morrón rojo",
  "1 morrón verde",
  "1 tomate",
  "1 cebolla",
  "1 cebolla de verdeo",
];

export interface AsadoResultItem extends AsadoItem {
  cantidad: number;
}

export function calcularAsado(participantes: number): AsadoResultItem[] {
  if (!Number.isFinite(participantes) || participantes <= 0) return [];

  return ASADO_ITEMS.map((item) => ({
    ...item,
    cantidad: roundTo(item.perPersona * participantes, 2),
  }));
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
