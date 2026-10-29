"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { EventListItem } from "@/lib/analytics/eventList";
import { filterEvents, type FilterOption } from "@/lib/analytics/eventSearch";
import { plural } from "@/lib/analytics/format";

const FIELD =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-eventos";

function EventCard({ item }: { item: EventListItem }) {
  return (
    <Link href={`/analytics/eventos/${item.id}`} className="block">
      <Card className="p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-foreground">{item.name}</h3>
            <p className="mt-0.5 text-xs text-foreground/50">{item.dateLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {item.hasFutbol && (
              <span
                role="img"
                aria-label="Con fútbol"
                className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px]"
              >
                ⚽
              </span>
            )}
            {item.status === "next" && (
              <span className="rounded-full bg-eventos-soft px-2 py-0.5 text-[11px] font-medium text-eventos">
                En curso
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-foreground/80">{item.attendanceLabel}</p>
        <p className={`mt-1 text-sm ${item.spendingLabel ? "text-foreground/80" : "text-foreground/40"}`}>
          {item.spendingLabel ?? "Sin gastos cargados"}
        </p>
      </Card>
    </Link>
  );
}

// Las opciones del desplegable agrupadas (Tipo / Año / Mes), en su orden.
function groupOptions(options: FilterOption[]): { group: string | null; options: FilterOption[] }[] {
  const groups: { group: string | null; options: FilterOption[] }[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}

// Buscador de eventos: texto (nombre o fecha) y un desplegable por tipo, año o
// mes. Los eventos llegan ya con sus textos formateados; acá solo se filtra.
export function EventsExplorer({ items, options }: { items: EventListItem[]; options: FilterOption[] }) {
  const searchId = useId();
  const filterId = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const shown = useMemo(() => filterEvents(items, query, filter), [items, query, filter]);
  const groups = useMemo(() => groupOptions(options), [options]);
  const filtering = query.trim() !== "" || filter !== "all";

  return (
    <div className="mt-6">
      <div role="search" className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={searchId} className="sr-only">
            Buscar evento por nombre o fecha
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o fecha (oct, 16/10…)"
            autoComplete="off"
            enterKeyHint="search"
            className={FIELD}
          />
        </div>
        <div className="sm:w-52">
          <label htmlFor={filterId} className="sr-only">
            Filtrar eventos
          </label>
          <select id={filterId} value={filter} onChange={(e) => setFilter(e.target.value)} className={FIELD}>
            {groups.map(({ group, options: groupOptions }) =>
              group === null ? (
                groupOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))
              ) : (
                <optgroup key={group} label={group}>
                  {groupOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} ({o.count})
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 text-xs text-foreground/50">
        {filtering ? `${shown.length} de ${plural(items.length, "evento", "eventos")}` : plural(items.length, "evento", "eventos")}
      </p>

      {shown.length === 0 ? (
        <Card className="mt-2 p-5 text-center">
          <p className="font-heading text-lg font-semibold text-foreground">No encontramos eventos</p>
          <p className="mt-1 text-sm text-foreground/60">
            {query.trim() !== ""
              ? `Nada coincide con «${query.trim()}»${filter !== "all" ? " en este filtro" : ""}.`
              : "No hay eventos en este filtro."}{" "}
            Probá con parte del nombre, un mes («oct») o un día («16/10»).
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-3 text-sm font-medium text-foreground/70 underline"
          >
            Quitar búsqueda y filtro
          </button>
        </Card>
      ) : (
        <ul className="mt-2 space-y-2">
          {shown.map((item) => (
            <li key={item.id}>
              <EventCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
