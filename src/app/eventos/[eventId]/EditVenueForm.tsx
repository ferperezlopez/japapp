"use client";

import { useState, useTransition } from "react";
import { updateVenue } from "../actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";

// Editar el lugar del evento (nombre, dirección, dueño de casa) — separado
// de "Editar evento" porque cualquier logueado puede tocar un lugar
// (policy "using (true)", ver 0022_venues_update_policy.sql), no solo quien
// creó el evento. Si el nombre cambia, updateVenue propaga el cambio a
// todos los eventos que ya usaban el nombre viejo (ver comentario en la
// action).
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
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
      >
        ✏️ Editar lugar
      </button>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(updateVenue(venue.id, formData));
          if (result.error) setError(result.error);
          else setOpen(false);
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
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Dirección
        </label>
        <input
          type="text"
          name="address"
          defaultValue={venue.address ?? ""}
          placeholder="Dirección o link de Google Maps"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-foreground/40">
          Para navegar directo: pegá la dirección (ej. &quot;Av. Cabildo 2394,
          CABA&quot;) o el link que da &quot;Compartir ubicación&quot; en
          Google Maps.
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
