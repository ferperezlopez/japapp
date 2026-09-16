"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee } from "../actions";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

type TaskType = "compra_insumos" | "lavado_platos" | "orden_sede";

type Assignee = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
};

type Member = {
  id: string;
  name: string | null;
  email: string;
};

// Mismo patrón visual que la sección de Invitados: chips con X para
// sacar, más un "+ Agregar" que revela un <select> — acá con los
// miembros que todavía no están asignados a esta tarea, para no poder
// sumar a la misma persona dos veces.
export function TaskAssigneesEditor({
  eventId,
  taskType,
  assignees,
  members,
}: {
  eventId: string;
  taskType: TaskType;
  assignees: Assignee[];
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(assignees.map((a) => a.userId));
  const available = members.filter((m) => !assignedIds.has(m.id));

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {assignees.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-1 rounded-full bg-surface py-1 pl-1 pr-2 text-xs text-foreground/80"
          >
            <Avatar src={a.avatarUrl} name={a.name} size="sm" />
            {a.name}
            <button
              type="button"
              onClick={() => {
                setRemovingId(a.id);
                startTransition(async () => {
                  await withMinDuration(removeTaskAssignee(a.id, eventId));
                });
              }}
              disabled={pending}
              className="rounded-full p-0.5 text-foreground/40 transition-colors duration-200 hover:bg-surface-border hover:text-red-600 disabled:opacity-60"
              title="Sacar de la tarea"
              aria-label="Sacar de la tarea"
            >
              {pending && removingId === a.id ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              )}
            </button>
          </li>
        ))}
        {assignees.length === 0 && (
          <li className="text-xs text-foreground/40">Sin asignar</li>
        )}
      </ul>

      {open ? (
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Elegí a alguien</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <Button
            type="button"
            loading={pending && !removingId}
            disabled={!selection}
            onClick={() => {
              const userId = selection;
              setRemovingId(null);
              startTransition(async () => {
                await withMinDuration(addTaskAssignee(eventId, taskType, userId));
                setSelection("");
                setOpen(false);
              });
            }}
          >
            Sumar
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          + Agregar
        </button>
      )}
    </div>
  );
}
