"use client";

import { useState, useTransition, type ReactNode } from "react";
import { updateEvent } from "../actions";
import { Button } from "@/components/ui/Button";
import { EventFormFields, type VenueOption } from "../EventFormFields";
import { NEW_VENUE_VALUE } from "@/lib/eventos/venueSelection";
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

// Se corrigió el lugar pero no se pudo sacar su ubicación de lo que se cargó: el clima no se va a
// mostrar. El formulario ya se cerró, así que el aviso queda debajo del botón de editar.
const VENUE_LOCATION_MISSING =
  "Lugar guardado, pero no pude sacar su ubicación de lo que cargaste, así que el clima no se va a mostrar. Probá con el link de «Compartir ubicación» de Google Maps (el largo, si el corto no anda) o pegá las coordenadas (ej. -34.60, -58.38).";

interface EventDefaults {
  name: string;
  eventDateLocal: string;
  location: string | null;
  description: string | null;
  hasFutbol: boolean;
  menu: string | null;
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
  venues: VenueOption[];
  members: { id: string; name: string | null; email: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div>
        {children}
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          aria-label="Editar evento"
          title="Editar evento"
          className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-eventos"
        >
          <PencilIcon />
        </button>
        {notice && (
          <p role="status" className="mt-2 text-xs text-foreground/60" data-testid="venue-notice">
            {notice}
          </p>
        )}
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
      // onSubmit y no `action`: con `action`, React 19 resetea el formulario al terminar de
      // enviar, y tras un error (nombre de lugar repetido, por ejemplo) la lista de lugares
      // volvía a «Sin lugar» y lo escrito se perdía: reintentar guardaba el evento sin lugar.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(updateEvent(eventId, formData));
          if (result.error) {
            setError(result.error);
          } else {
            setNotice(result.venueLocation === "missing" ? VENUE_LOCATION_MISSING : null);
            setOpen(false);
          }
        });
      }}
      className="animate-reveal space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      {/* El menú con el que se abrió el formulario: updateEvent solo toca la columna
          cuando se pone, se cambia o se saca un menú (spec 025). */}
      <input type="hidden" name="menuBefore" value={event.menu ?? ""} />
      <EventFormFields
        venues={venues}
        allowEditVenue
        members={members}
        defaultName={event.name}
        defaultEventDate={event.eventDateLocal}
        defaultVenueValue={defaultVenueValue}
        defaultNewVenueName={defaultNewVenueName}
        defaultDescription={event.description ?? ""}
        defaultHasFutbol={event.hasFutbol}
        defaultMenu={event.menu ?? ""}
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
