"use client";

import { useState, useTransition } from "react";
import { addGuestToEvent } from "../actions";
import { Button } from "@/components/ui/Button";
import { withMinDuration } from "@/lib/withMinDuration";

const NEW_GUEST_VALUE = "__new__";

// Mismo patrón que el selector de lugares en EventFormFields: elegir un
// invitado ya registrado (reusable entre eventos) o cargar uno nuevo.
export function AddGuestForm({
  eventId,
  kind,
  guests,
  members,
  currentUserId,
}: {
  eventId: string;
  kind: "juntada" | "futbol";
  guests: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  currentUserId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
      >
        + Sumar invitado
      </button>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(
            addGuestToEvent(eventId, kind, formData),
          );
          if (result.error) {
            setError(result.error);
          } else {
            setOpen(false);
            setSelection("");
          }
        });
      }}
      className="animate-reveal mt-2 flex flex-wrap items-start gap-2"
    >
      <div>
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Elegí un invitado</option>
          {guests.map((guest) => (
            <option key={guest.id} value={guest.id}>
              {guest.name}
            </option>
          ))}
          <option value={NEW_GUEST_VALUE}>+ Nueva persona…</option>
        </select>
        {selection === NEW_GUEST_VALUE && (
          <input
            type="text"
            name="newGuestName"
            placeholder="Nombre del invitado"
            required
            autoFocus
            className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        )}
      </div>
      <input
        type="hidden"
        name="existingGuestId"
        value={selection === NEW_GUEST_VALUE ? "" : selection}
      />
      <div>
        <select
          name="broughtBy"
          defaultValue={currentUserId}
          className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === currentUserId ? "Yo lo traigo" : `Lo trae: ${m.name ?? m.email}`}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" loading={pending}>
        {pending ? "Sumando..." : "Sumar"}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
      >
        Cancelar
      </button>
      {error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
