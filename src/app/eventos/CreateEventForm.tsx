"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./actions";
import { Button } from "@/components/ui/Button";

export function CreateEventForm() {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
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
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Lugar (opcional)
          </label>
          <input
            type="text"
            name="location"
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
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
