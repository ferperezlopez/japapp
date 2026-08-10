export interface EmpanadaItem {
  key: string;
  label: string;
  porDocena: number;
  unit: string;
  indent?: boolean;
}

// Factores por docena extraídos de la planilla "Empanada Calculator".
export const EMPANADA_ITEMS: EmpanadaItem[] = [
  { key: "bolaDeLomo", label: "Bola de lomo", porDocena: 750, unit: "gr" },
  { key: "cebolla", label: "Cebolla", porDocena: 250, unit: "gr" },
  { key: "verdeo", label: "Verdeo", porDocena: 80, unit: "gr" },
  { key: "morron", label: "Morrón", porDocena: 0.5, unit: "u" },
  { key: "chardonay", label: "Chardonay", porDocena: 125, unit: "cc" },
  { key: "manteca", label: "Manteca", porDocena: 25, unit: "gr" },
  { key: "calditos", label: "Calditos de verdura", porDocena: 1, unit: "u" },
  {
    key: "aguaCalditos",
    label: "Agua para calditos",
    porDocena: 225,
    unit: "cc",
    indent: true,
  },
  { key: "huevos", label: "Huevos", porDocena: 2.5, unit: "u" },
  { key: "aceitunas", label: "Aceitunas", porDocena: 27, unit: "gr" },
];

// Estos condimentos se agregan "a gusto" (c/n = cantidad necesaria),
// no escalan de forma lineal con la cantidad de docenas.
export const EMPANADA_A_GUSTO = ["Sal", "Pimienta", "Provenzal", "Laurel"];

export const EMPANADA_RECETA = [
  "Picar la cebolla y el morrón. Rehogar y condimentar. Retirar y limpiar la olla.",
  "Colocar un hilo de aceite y poner la carne a cocinar. Agregar sal, pimienta y provenzal.",
  "Cuando esté más o menos cocida, agregar el vino. Dejar evaporar el alcohol. Agregar el laurel.",
  "Echar las verduras rehogadas, el caldo y la manteca. Bajar el fuego y dejar cocinar hasta que baje un poco el líquido.",
  "Dejar enfriar y llevar a la heladera. Al momento del armado, agregar al relleno los huevos picados, las aceitunas y la parte verde del verdeo.",
];

export interface EmpanadaResultItem extends EmpanadaItem {
  cantidad: number;
}

export function calcularEmpanadas(docenas: number): EmpanadaResultItem[] {
  if (!Number.isFinite(docenas) || docenas <= 0) return [];

  return EMPANADA_ITEMS.map((item) => ({
    ...item,
    cantidad: roundTo(item.porDocena * docenas, 2),
  }));
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
