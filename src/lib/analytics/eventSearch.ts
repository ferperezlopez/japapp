// Buscador y filtro de la lista de eventos (spec 021): se busca por nombre y por
// fecha («oct», «16/10», «octubre 2026», «viernes»), sin importar mayúsculas ni
// acentos, y un desplegable acota por tipo, año o mes. Las fechas van en hora de
// Argentina: el servidor corre en UTC y un evento de las 21 h cae en el día
// siguiente.

const TIME_ZONE = "America/Argentina/Buenos_Aires";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const monthLong = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: TIME_ZONE });
const monthShort = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: TIME_ZONE });
const weekdayLong = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: TIME_ZONE });
const weekdayShort = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: TIME_ZONE });

export interface SearchableEvent {
  id: string;
  name: string;
  eventDate: string;
  hasFutbol: boolean;
}

/** `all`, `futbol`, `sin-futbol`, `year:2026` o `month:2026-10`. */
export type EventFilter = string;

export interface FilterOption {
  value: EventFilter;
  label: string;
  group: "Tipo" | "Año" | "Mes" | null;
  count: number;
}

// Minúsculas y sin acentos («Cumpleaños» ≈ «cumpleanos»); espacios colapsados.
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dateParts(iso: string): { year: string; month: string; day: string } {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { year: p.year, month: p.month, day: p.day };
}

// Todo lo que se puede escribir para encontrar un evento, ya normalizado:
// «16/10», «16/10/2026», «2026-10-16», «16 oct», «octubre», «2026», «viernes»…
export function eventSearchText(event: SearchableEvent): string {
  const { year, month, day } = dateParts(event.eventDate);
  const date = new Date(event.eventDate);
  // Con el cero adelante (02/10): «2/10» y «02/10» lo encuentran porque la primera
  // es subcadena de la segunda.
  return normalizeText(
    [
      event.name,
      `${day}/${month}`,
      `${day}/${month}/${year}`,
      `${year}-${month}-${day}`,
      `${day} ${monthShort.format(date)}`,
      `${day} de ${monthLong.format(date)} de ${year}`,
      monthLong.format(date),
      monthShort.format(date),
      year,
      weekdayLong.format(date),
      weekdayShort.format(date),
    ].join(" | "),
  );
}

function matchesFilter(event: SearchableEvent, filter: EventFilter): boolean {
  if (filter === "all" || filter === "") return true;
  if (filter === "futbol") return event.hasFutbol;
  if (filter === "sin-futbol") return !event.hasFutbol;
  const { year, month } = dateParts(event.eventDate);
  if (filter.startsWith("year:")) return filter === `year:${year}`;
  if (filter.startsWith("month:")) return filter === `month:${year}-${month}`;
  return true;
}

// Cada palabra de la búsqueda tiene que aparecer en algún lado (nombre o fecha):
// «cumple oct» encuentra «JAPA + Cumple Tato» de octubre. Conserva el orden.
export function filterEvents<T extends SearchableEvent>(
  events: readonly T[],
  query: string,
  filter: EventFilter = "all",
): T[] {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  return events.filter((event) => {
    if (!matchesFilter(event, filter)) return false;
    if (tokens.length === 0) return true;
    const haystack = eventSearchText(event);
    return tokens.every((token) => haystack.includes(token));
  });
}

// Opciones del desplegable, solo las que tienen eventos (con su cantidad): los
// meses del más reciente al más viejo.
export function eventFilterOptions(events: readonly SearchableEvent[]): FilterOption[] {
  const options: FilterOption[] = [{ value: "all", label: "Todos los eventos", group: null, count: events.length }];

  const withFutbol = events.filter((e) => e.hasFutbol).length;
  if (withFutbol > 0) options.push({ value: "futbol", label: "Con fútbol", group: "Tipo", count: withFutbol });
  if (events.length - withFutbol > 0) {
    options.push({ value: "sin-futbol", label: "Sin fútbol", group: "Tipo", count: events.length - withFutbol });
  }

  const years = new Map<string, number>();
  const months = new Map<string, { label: string; count: number }>();
  for (const event of events) {
    const { year, month } = dateParts(event.eventDate);
    years.set(year, (years.get(year) ?? 0) + 1);
    const key = `${year}-${month}`;
    const label = `${monthLong.format(new Date(event.eventDate))} ${year}`;
    months.set(key, { label, count: (months.get(key)?.count ?? 0) + 1 });
  }
  for (const [year, count] of [...years].sort((a, b) => b[0].localeCompare(a[0]))) {
    options.push({ value: `year:${year}`, label: year, group: "Año", count });
  }
  for (const [key, { label, count }] of [...months].sort((a, b) => b[0].localeCompare(a[0]))) {
    options.push({ value: `month:${key}`, label, group: "Mes", count });
  }
  return options;
}
