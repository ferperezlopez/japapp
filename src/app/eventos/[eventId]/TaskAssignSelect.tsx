"use client";

import { useTransition } from "react";
import { assignEventTask } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

type TaskType =
  | "compra_insumos"
  | "lavado_platos"
  | "orden_sede"
  | "reserva_cancha"
  | "convocatoria";

// Auto-submit al cambiar de selección — mismo criterio de confianza total
// que MVP/goleador de fútbol, pero sin botón de "Guardar" separado porque
// acá hay hasta 5 tareas en la misma sección y pedir un submit por cada
// una sería tedioso.
export function TaskAssignSelect({
  eventId,
  taskType,
  assignedTo,
  members,
}: {
  eventId: string;
  taskType: TaskType;
  assignedTo: string | null;
  members: { id: string; name: string | null; email: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={assignedTo ?? ""}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await withMinDuration(
              assignEventTask(eventId, taskType, e.target.value || null),
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
