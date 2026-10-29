// Tareas de organización para Analytics (spec 021): cuántas veces se anotó cada
// persona en cada tipo de tarea. No existe el estado «hecha» (alguien se anota o
// lo anotan y listo), así que se cuenta lo asignado, y solo en eventos que YA
// pasaron: lo asignado a un evento que todavía no ocurrió no es algo que hizo.

import type { EventRow, TaskCounts, TaskKey, TaskRow } from "./types";

// En el orden en que se muestran los selectores.
export const TASK_KEYS: TaskKey[] = [
  "compra_insumos",
  "lavado_platos",
  "orden_sede",
  "reserva_cancha",
  "convocatoria",
];

export const TASK_LABELS: Record<TaskKey, string> = {
  compra_insumos: "Compra de insumos",
  lavado_platos: "Lavado de platos",
  orden_sede: "Orden de la sede",
  reserva_cancha: "Reserva de cancha",
  convocatoria: "Convocatoria",
};

// Rótulos cortos para los chips del selector.
export const TASK_SHORT_LABELS: Record<TaskKey, string> = {
  compra_insumos: "Insumos",
  lavado_platos: "Platos",
  orden_sede: "Sede",
  reserva_cancha: "Cancha",
  convocatoria: "Convocatoria",
};

export function emptyTaskCounts(): TaskCounts {
  return {
    total: 0,
    byType: {
      compra_insumos: 0,
      lavado_platos: 0,
      orden_sede: 0,
      reserva_cancha: 0,
      convocatoria: 0,
    },
  };
}

// «Convocatoria» es quien creó el evento (`events.created_by`); el resto son las
// filas de `event_tasks`. Cada persona cuenta UNA vez por evento y tipo: quien
// compra tres insumos en la misma JAPA hizo «compra de insumos» una vez.
export function countTasks(
  pastEvents: readonly EventRow[],
  tasks: readonly TaskRow[],
): Map<string, TaskCounts> {
  const counts = new Map<string, TaskCounts>();
  const bump = (userId: string, key: TaskKey) => {
    const entry = counts.get(userId) ?? emptyTaskCounts();
    entry.byType[key]++;
    entry.total++;
    counts.set(userId, entry);
  };

  const past = new Set(pastEvents.map((e) => e.id));
  const seen = new Set<string>();
  for (const t of tasks) {
    if (!past.has(t.eventId)) continue;
    const key = `${t.eventId}|${t.taskType}|${t.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bump(t.userId, t.taskType);
  }
  for (const e of pastEvents) {
    if (e.createdBy) bump(e.createdBy, "convocatoria");
  }
  return counts;
}
