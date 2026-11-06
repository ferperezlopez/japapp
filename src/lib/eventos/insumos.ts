// Palabra clave -> emoji, para mostrar un ícono junto al nombre de un
// insumo cargado en "Compra de insumos" cuando aplica. Son insumos de
// texto libre (no una lista fija como la de las calculadoras), así que el
// match es por substring de palabras clave habituales, no por igualdad
// exacta; si ninguna palabra clave matchea, no se muestra ícono.
const ICON_KEYWORDS: [string, string][] = [
  ["carne", "🥩"],
  ["asado", "🥩"],
  ["bife", "🥩"],
  ["pollo", "🍗"],
  ["chori", "🌭"],
  ["morcilla", "🌭"],
  ["hielo", "🧊"],
  ["cerveza", "🍺"],
  ["vino", "🍷"],
  ["fernet", "🥃"],
  ["whisky", "🥃"],
  ["gaseosa", "🥤"],
  ["coca", "🥤"],
  ["sprite", "🥤"],
  ["agua", "💧"],
  ["pan", "🍞"],
  ["papas", "🍟"],
  ["snack", "🍿"],
  ["pochoclo", "🍿"],
  ["queso", "🧀"],
  ["picada", "🧀"],
  ["postre", "🍰"],
  ["torta", "🍰"],
  ["fruta", "🍎"],
  ["carbon", "🔥"],
  ["carbón", "🔥"],
  ["leña", "🔥"],
  ["mate", "🧉"],
  ["yerba", "🧉"],
  ["hamburguesa", "🍔"],
  ["ensalada", "🥗"],
  ["vaso", "🥤"],
  ["servilleta", "🧻"],
  ["plato", "🍽️"],
  ["cubierto", "🍴"],
];

// Saca tildes y pasa a minúsculas — mismo criterio de normalización que
// find_similar_profile_names (0015), acá aplicado en JS porque los
// insumos ya vienen cargados completos al cliente, sin necesitar un RPC.
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function iconForInsumo(name: string): string | null {
  const normalized = normalize(name);
  for (const [keyword, icon] of ICON_KEYWORDS) {
    if (normalized.includes(normalize(keyword))) return icon;
  }
  return null;
}

// El emoji guardado en la base (editable por admin, insumo_items.icon)
// tiene prioridad sobre el derivado por palabra clave — este último
// queda como fallback para ítems viejos que nunca se editaron a mano.
export function resolveIcon(item: { name: string; icon: string | null }): string | null {
  return item.icon ?? iconForInsumo(item.name);
}

// true si `itemName` es un resultado válido para el texto de búsqueda
// `query` (substring, sin importar mayúsculas/tildes). Un query vacío
// matchea cualquier cosa (lista completa mientras no se tipeó nada).
export function matchesQuery(itemName: string, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return normalize(itemName).includes(normalizedQuery);
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

// Coeficiente de Dice sobre trigramas — mismo criterio de "se parece
// bastante" que pg_trgm's similarity() usado en find_similar_profile_names
// (0015), reimplementado en JS puro porque acá no hace falta un RPC (los
// insumos ya están completos en memoria del lado del cliente).
export function similarity(a: string, b: string): number {
  const gramsA = trigrams(normalize(a));
  const gramsB = trigrams(normalize(b));
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let shared = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) shared++;
  return (2 * shared) / (gramsA.size + gramsB.size);
}

// Insumo ya cargado más parecido a `candidateName`, si supera el umbral —
// mismo umbral (0.4) que find_similar_profile_names, para no inventar un
// criterio nuevo de "se parece" dentro del mismo repo.
export function findSimilarItem<T extends { name: string }>(
  items: T[],
  candidateName: string,
  threshold = 0.4,
): T | null {
  let best: T | null = null;
  let bestScore = threshold;
  for (const item of items) {
    const score = similarity(item.name, candidateName);
    if (score >= bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

// Primera letra en mayúscula (el resto queda como se escribió: «Coca cola», «7up», «Ñoquis») y sin
// espacios de los costados. Los insumos del catálogo siempre empiezan con mayúscula: lo mismo que
// hace el trigger de la base (0051), para que lo que se ve en pantalla sea lo que queda guardado.
export function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// La cantidad de un insumo («2 kg», «3 litros», «1 pack») es texto libre y opcional. Mismo tope que
// la restricción de la base (event_tasks_quantity_format, 0051), que cuenta caracteres.
export const MAX_QUANTITY_LENGTH = 40;

export type QuantityResult = { value: string | null } | { error: string };

// Deja la cantidad como se guarda: espacios de los costados afuera y los del medio en uno solo
// (la base exige que no sobren). Vacía = sin cantidad (`null`); más larga que el tope = error.
export function normalizeQuantity(raw: string | null | undefined): QuantityResult {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return { value: null };
  // Por caracteres (puntos de código), igual que char_length de la base: un emoji cuenta uno.
  if (Array.from(value).length > MAX_QUANTITY_LENGTH) {
    return { error: `La cantidad es muy larga (máximo ${MAX_QUANTITY_LENGTH} caracteres).` };
  }
  return { value };
}
