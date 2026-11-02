// Menú de un evento (events.menu, migración 0049): qué se come. Opcional y de texto
// libre; la app ofrece una lista corta y, al crear un evento nuevo, sugiere qué hacer
// según lo que se hizo antes y hace cuánto no se hace (spec 025).
export interface MenuOption {
  label: string;
  icon: string;
}

export const MENU_OPTIONS: readonly MenuOption[] = [
  { label: "Asado", icon: "🥩" },
  { label: "Empanadas", icon: "🥟" },
  { label: "Pizza", icon: "🍕" },
  { label: "Pastas", icon: "🍝" },
  { label: "Hamburguesas", icon: "🍔" },
];

export const MAX_MENU_LENGTH = 40;

/** Para comparar menús: sin mayúsculas, sin tildes y con los espacios colapsados. */
export function normalizeMenu(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function optionFor(text: string): MenuOption | undefined {
  const key = normalizeMenu(text);
  return MENU_OPTIONS.find((option) => normalizeMenu(option.label) === key);
}

export type MenuParseResult = { ok: true; menu: string | null } | { ok: false; error: string };

/**
 * Lo que se guarda en `events.menu` a partir de lo escrito en el formulario: vacío es
 * «sin menú»; si coincide con uno de la lista (sin importar mayúsculas ni tildes) se
 * guarda con su escritura canónica, para no tener «asado» y «Asado» como dos menús.
 */
export function parseMenu(raw: FormDataEntryValue | null): MenuParseResult {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return { ok: true, menu: null };
  if (text.length > MAX_MENU_LENGTH) {
    return { ok: false, error: `El menú puede tener hasta ${MAX_MENU_LENGTH} caracteres.` };
  }
  return { ok: true, menu: optionFor(text)?.label ?? text };
}

/** El emoji de un menú de la lista, o null para uno escrito a mano. */
export function menuIcon(menu: string): string | null {
  return optionFor(menu)?.icon ?? null;
}

export interface MenuHistoryEntry {
  menu: string | null;
  /** `events.event_date` tal cual está guardada. */
  eventDate: string;
}

export interface MenuSuggestion {
  menu: string;
  icon: string | null;
  /** Días de calendario desde la última vez que se hizo. */
  daysAgo: number;
  /** Cuántas veces se hizo en los eventos anteriores. */
  times: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// La fecha guardada son los dígitos de la hora de Buenos Aires (UTC−3, sin horario de verano).
const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000;

/** Días de calendario (en Buenos Aires) entre el día de la fecha guardada y hoy. */
function calendarDaysSince(eventDate: string, now: Date): number {
  const today = new Date(now.getTime() + BUENOS_AIRES_OFFSET_MS).toISOString().slice(0, 10);
  return Math.round((Date.parse(today) - Date.parse(eventDate.slice(0, 10))) / DAY_MS);
}

/**
 * Qué menús sugerir al crear un evento: los que ya se hicieron en eventos anteriores,
 * del que hace más tiempo que no se hace al que se hizo hace menos. Un menú cuenta una
 * vez por más eventos que lo hayan tenido; a igual antigüedad va primero el que más se
 * hizo. Solo cuentan los eventos que ya pasaron y los que tienen menú cargado.
 */
export function suggestMenus(
  history: readonly MenuHistoryEntry[],
  now: Date,
  limit = 4,
): MenuSuggestion[] {
  const byMenu = new Map<string, { menu: string; lastDate: string; times: number }>();

  for (const entry of history) {
    if (!entry.menu) continue;
    const daysAgo = calendarDaysSince(entry.eventDate, now);
    if (daysAgo < 0) continue; // todavía no pasó
    const key = normalizeMenu(entry.menu);
    const found = byMenu.get(key);
    if (!found) {
      byMenu.set(key, { menu: entry.menu, lastDate: entry.eventDate, times: 1 });
    } else {
      found.times += 1;
      // Se queda con la escritura y la fecha de la vez más reciente.
      if (entry.eventDate > found.lastDate) {
        found.lastDate = entry.eventDate;
        found.menu = entry.menu;
      }
    }
  }

  return [...byMenu.values()]
    .map(({ menu, lastDate, times }) => ({
      menu: optionFor(menu)?.label ?? menu,
      icon: menuIcon(menu),
      daysAgo: calendarDaysSince(lastDate, now),
      times,
    }))
    .sort(
      (a, b) =>
        b.daysAgo - a.daysAgo || b.times - a.times || a.menu.localeCompare(b.menu, "es"),
    )
    .slice(0, limit);
}

/** «hoy», «ayer», «hace 5 días», «hace 6 semanas», «hace 3 meses», «hace más de un año». */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
  if (days >= 360) return "hace más de un año";
  return `hace ${Math.floor(days / 30)} meses`;
}
