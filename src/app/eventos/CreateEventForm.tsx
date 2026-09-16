"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./actions";
import { Button } from "@/components/ui/Button";
import { EventFormFields } from "./EventFormFields";
import { withMinDuration } from "@/lib/withMinDuration";

export function CreateEventForm({
  venues,
}: {
  venues: { id: string; name: string }[];
}) {
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
          const result = await withMinDuration(createEvent(formData));
          if (result.error) {
            setError(result.error);
          } else if (result.eventId) {
            router.push(`/eventos/${result.eventId}`);
          }
        });
      }}
      className="space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <EventFormFields venues={venues} />

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
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
