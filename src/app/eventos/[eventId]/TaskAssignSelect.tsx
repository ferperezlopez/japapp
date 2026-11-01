"use client";

import { useTransition } from "react";
import { setReservaCanchaAssignee } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

// Única tarea de una sola persona a la vez ("Reserva de cancha"):
// auto-submit al cambiar de selección, reemplazando a quien estaba
// antes en vez de sumar (a diferencia de TaskAssigneesEditor).
export function TaskAssignSelect({
  eventId,
  assignedTo,
  members,
  readOnly = false,
}: {
  eventId: string;
  assignedTo: string | null;
  members: { id: string; name: string | null; email: string }[];
  // Evento cerrado (spec 022): se ve quién la tiene, pero no se puede reasignar.
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (readOnly) {
    const assignee = members.find((m) => m.id === assignedTo);
    return (
      <p className="text-sm text-foreground/80">
        {assignee ? (assignee.name ?? assignee.email) : (
          <span className="text-foreground/40">Sin asignar</span>
        )}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={assignedTo ?? ""}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await withMinDuration(
              setReservaCanchaAssignee(eventId, e.target.value || null),
            );
          })
        }
        className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="">Sin asignar</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ?? m.email}
          </option>
        ))}
      </select>
      {pending && <Spinner className="h-4 w-4 shrink-0" />}
    </div>
  );
}
