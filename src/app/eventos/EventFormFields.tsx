"use client";

import { useState } from "react";
import {
  MAX_MENU_LENGTH,
  MENU_OPTIONS,
  formatDaysAgo,
  normalizeMenu,
  type MenuSuggestion,
} from "@/lib/eventos/menu";

const weekdayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const NEW_VENUE_VALUE = "__new__";

// Campos compartidos por el alta y la edición de un evento: nombre,
// fecha/hora (con el día de la semana calculado, porque el picker nativo
// no lo muestra), lugar (select de venues + opción de cargar uno nuevo) y
// notas. Cada formulario que lo usa se ocupa de su propio <form>/action.
export function EventFormFields({
  venues,
  members,
  defaultName = "",
  defaultEventDate = "",
  defaultVenueValue = "",
  defaultNewVenueName = "",
  defaultNewVenueHostUserId = "",
  defaultDescription = "",
  defaultHasFutbol = false,
  defaultMenu = "",
  menuSuggestions = [],
}: {
  venues: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  defaultName?: string;
  defaultEventDate?: string;
  defaultVenueValue?: string;
  defaultNewVenueName?: string;
  defaultNewVenueHostUserId?: string;
  defaultDescription?: string;
  defaultHasFutbol?: boolean;
  defaultMenu?: string;
  /** Qué menús sugerir (spec 025): los que ya se hicieron, del que hace más que no se hace. */
  menuSuggestions?: MenuSuggestion[];
}) {
  const [eventDateValue, setEventDateValue] = useState(defaultEventDate);
  const [venueSelection, setVenueSelection] = useState(defaultVenueValue);
  const [menu, setMenu] = useState(defaultMenu);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Nombre
          </label>
          <input
            type="text"
            name="name"
            defaultValue={defaultName}
            placeholder="JAPA del viernes"
            required
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Fecha y hora
          </label>
          <input
            type="datetime-local"
            name="eventDate"
            required
            value={eventDateValue}
            onChange={(e) => setEventDateValue(e.target.value)}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
          {/* El picker nativo de datetime-local no muestra el día de la
              semana en ningún browser: lo mostramos calculado nosotros. */}
          {eventDateValue && (
            <p className="mt-1 text-xs capitalize text-foreground/50">
              {weekdayFormatter.format(new Date(eventDateValue))}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Lugar (opcional)
          </label>
          <select
            name="venue"
            value={venueSelection}
            onChange={(e) => setVenueSelection(e.target.value)}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin lugar</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.name}>
                {venue.name}
              </option>
            ))}
            <option value={NEW_VENUE_VALUE}>+ Nuevo lugar…</option>
          </select>
          {venueSelection === NEW_VENUE_VALUE && (
            <>
              <input
                type="text"
                name="newVenueName"
                defaultValue={defaultNewVenueName}
                placeholder="Nombre del lugar nuevo"
                required
                className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
              />
              <select
                name="newVenueHostUserId"
                defaultValue={defaultNewVenueHostUserId}
                className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
              >
                <option value="">¿De quién es la casa? (opcional)</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name ?? member.email}
                  </option>
                ))}
              </select>
              <input
                type="text"
                name="newVenueAddress"
                placeholder="Dirección o link de Google Maps (opcional)"
                className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-foreground/40">
                Para navegar directo y para el clima: pegá el link que da
                &quot;Compartir ubicación&quot; en Google Maps o las coordenadas
                (ej. -34.60, -58.38). Una dirección escrita (ej. &quot;Av.
                Cabildo 2394, CABA&quot;) sirve para navegar, pero no para el
                clima.
              </p>
            </>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Notas (opcional)
          </label>
          <input
            type="text"
            name="description"
            defaultValue={defaultDescription}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Menú (opcional)
        </label>
        {menuSuggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Menús sugeridos">
            {menuSuggestions.map((suggestion) => {
              const selected = normalizeMenu(menu) === normalizeMenu(suggestion.menu);
              return (
                <button
                  key={suggestion.menu}
                  type="button"
                  onClick={() => setMenu(suggestion.menu)}
                  aria-pressed={selected}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors duration-200 ${
                    selected
                      ? "border-eventos bg-eventos-soft font-medium text-eventos"
                      : "border-surface-border text-foreground/70 hover:border-eventos hover:text-eventos"
                  }`}
                >
                  {suggestion.icon && <span aria-hidden="true">{suggestion.icon} </span>}
                  {suggestion.menu} · {formatDaysAgo(suggestion.daysAgo)}
                </button>
              );
            })}
          </div>
        )}
        <input
          type="text"
          name="menu"
          value={menu}
          onChange={(e) => setMenu(e.target.value)}
          maxLength={MAX_MENU_LENGTH}
          list="menu-options"
          placeholder="Asado, empanadas, pizza…"
          className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
        <datalist id="menu-options">
          {MENU_OPTIONS.map((option) => (
            <option key={option.label} value={option.label} />
          ))}
        </datalist>
        {menuSuggestions.length > 0 && (
          <p className="mt-1 text-xs text-foreground/40">
            Sugerido según los eventos anteriores: primero lo que hace más que no se hace.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground/70">
        <input
          type="checkbox"
          name="hasFutbol"
          defaultChecked={defaultHasFutbol}
          className="h-4 w-4 rounded border-surface-border text-eventos focus:ring-eventos"
        />
        ¿Hay fútbol además de la juntada?
      </label>
    </>
  );
}
