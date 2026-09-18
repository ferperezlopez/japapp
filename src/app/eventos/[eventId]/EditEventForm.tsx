"use client";

import { useState, useTransition, type ReactNode } from "react";
import { updateEvent } from "../actions";
import { Button } from "@/components/ui/Button";
import { EventFormFields, NEW_VENUE_VALUE } from "../EventFormFields";
import { withMinDuration } from "@/lib/withMinDuration";

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </svg>
  );
}

interface EventDefaults {
  name: string;
  eventDateLocal: string;
  location: string | null;
  description: string | null;
  hasFutbol: boolean;
}

export function EditEventForm({
  eventId,
  event,
  venues,
  members,
  children,
}: {
  eventId: string;
  event: EventDefaults;
  venues: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div>
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Editar evento"
          title="Editar evento"
          className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-eventos"
        >
          <PencilIcon />
        </button>
      </div>
    );
  }

  // Si el lugar guardado coincide con un venue de la lista, se preselecciona
  // en el <select>; si no (o si nunca hubo lugar), cae en "Sin lugar" o en
  // "Nuevo lugar…" con el texto ya cargado.
  const matchesVenue = venues.some((v) => v.name === event.location);
  const defaultVenueValue = event.location
    ? matchesVenue
      ? event.location
      : NEW_VENUE_VALUE
    : "";
  const defaultNewVenueName = event.location && !matchesVenue ? event.location : "";

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(updateEvent(eventId, formData));
          if (result.error) {
            setError(result.error);
          } else {
            setOpen(false);
          }
        });
      }}
      className="animate-reveal space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <EventFormFields
        venues={venues}
        members={members}
        defaultName={event.name}
        defaultEventDate={event.eventDateLocal}
        defaultVenueValue={defaultVenueValue}
        defaultNewVenueName={defaultNewVenueName}
        defaultDescription={event.description ?? ""}
        defaultHasFutbol={event.hasFutbol}
      />

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar cambios"}
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
