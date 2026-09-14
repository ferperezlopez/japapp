"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./actions";
import { Button } from "@/components/ui/Button";

const weekdayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const NEW_VENUE_VALUE = "__new__";

export function CreateEventForm({
  venues,
}: {
  venues: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [eventDateValue, setEventDateValue] = useState("");
  const [venueSelection, setVenueSelection] = useState("");
  const router = useRouter();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nuevo evento</Button>;
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await createEvent(formData);
          if (result.error) {
            setError(result.error);
          } else if (result.eventId) {
            router.push(`/eventos/${result.eventId}`);
          }
        });
      }}
      className="space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Nombre
          </label>
          <input
            type="text"
            name="name"
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
            <input
              type="text"
              name="newVenueName"
              placeholder="Nombre del lugar nuevo"
              required
              className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Notas (opcional)
          </label>
          <input
            type="text"
            name="description"
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground/70">
        <input
          type="checkbox"
          name="hasFutbol"
          className="h-4 w-4 rounded border-surface-border text-eventos focus:ring-eventos"
        />
        ¿Hay fútbol además de la juntada?
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando..." : "Crear evento"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
