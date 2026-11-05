"use client";

import { useState, useTransition } from "react";
import { updateVenue } from "../actions";
import { Button } from "@/components/ui/Button";
import type { VenueLocationStatus } from "@/lib/eventos/venueLocation";
import { withMinDuration } from "@/lib/withMinDuration";

// Qué decirle a quien guardó la sede, según se pudo (o no) sacar la ubicación para el clima.
const NOTICES: Record<VenueLocationStatus, string> = {
  found: "Lugar guardado. Ubicación detectada: el clima va a ser el de esta sede.",
  missing:
    "Lugar guardado, pero no pude sacar la ubicación de lo que cargaste, así que el clima no se va a mostrar. Probá con el link de «Compartir ubicación» de Google Maps (el largo, si el corto no anda) o pegá las coordenadas (ej. -34.60, -58.38).",
  none: "Lugar guardado. Sin el link de Google Maps no hay clima: cargalo cuando quieras con «Editar lugar».",
};

// Editar el lugar del evento (nombre, link de GPS, de quién es la casa) — separado de «Editar
// evento» porque cualquier logueado puede corregir una sede (son datos compartidos del grupo),
// no solo quien creó el evento. Si cambia el nombre, el lugar se renombra también en los
// eventos que ya lo usaban (update_venue, migración 0050); si cambia el link, el clima se
// vuelve a pedir para la nueva ubicación.
export function EditVenueForm({
  venue,
  members,
}: {
  venue: {
    id: string;
    name: string;
    address: string | null;
    host_user_id: string | null;
  };
  members: { id: string; name: string | null; email: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          className="text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          ✏️ Editar lugar
        </button>
        {notice && (
          <p role="status" className="mt-1 text-xs text-foreground/60" data-testid="venue-notice">
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(updateVenue(venue.id, formData));
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setNotice(NOTICES[result.location]);
          setOpen(false);
        });
      }}
      className="animate-reveal mt-2 space-y-2 rounded-xl border border-surface-border bg-background p-3"
    >
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Nombre
        </label>
        <input
          type="text"
          name="name"
          defaultValue={venue.name}
          required
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-foreground/40">
          Si lo cambiás, se cambia también en los eventos que ya usaban este lugar.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Dirección o link de Google Maps (GPS)
        </label>
        <input
          type="text"
          name="address"
          defaultValue={venue.address ?? ""}
          placeholder="Link de «Compartir ubicación», dirección o coordenadas"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-foreground/40">
          El clima del evento sale de la ubicación de este link: pegá el que da
          &quot;Compartir ubicación&quot; en Google Maps (el corto o el largo) o las
          coordenadas (ej. -34.60, -58.38). Una dirección escrita sirve para
          navegar, pero no para el clima.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          ¿De quién es la casa?
        </label>
        <select
          name="hostUserId"
          defaultValue={venue.host_user_id ?? ""}
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sin especificar</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar lugar"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
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
