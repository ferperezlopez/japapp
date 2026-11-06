import { capitalizeFirst } from "./insumos";

export type TaskKind = "compra_insumos" | "lavado_platos" | "orden_sede" | "reserva_cancha";

/** Lo que se muestra cuando un insumo asignado no se encuentra en el catálogo (no debería pasar). */
export const UNNAMED_ITEM_LABEL = "Insumo sin nombre";

/**
 * Quiénes pueden recibir una tarea: las personas que confirmaron «Voy» a la juntada, en el orden en
 * que vienen `members`. Los invitados no entran (no son perfiles) y quien dijo «Tal vez» o «No voy»,
 * o no respondió, tampoco. Es solo un filtro de la pantalla: lo que ya está asignado no se toca.
 */
export function confirmedMembers<T extends { id: string }>(
  members: T[],
  attendees: { userId: string; status: string }[],
): T[] {
  const going = new Set(attendees.filter((a) => a.status === "yes").map((a) => a.userId));
  return members.filter((m) => going.has(m.id));
}

/** Agrupa las asignaciones por persona, en el orden en que aparece cada una por primera vez. */
export function groupByPerson<T extends { userId: string }>(
  rows: T[],
): { userId: string; rows: T[] }[] {
  const groups: { userId: string; rows: T[] }[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.userId === row.userId);
    if (!group) {
      group = { userId: row.userId, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export interface ShareTaskRow {
  userId: string;
  userName: string;
  /** Solo en «Compra de insumos»: qué trae esa persona. */
  itemName?: string | null;
  quantity?: string | null;
}

export interface ShareTask {
  type: TaskKind;
  label: string;
  rows: ShareTaskRow[];
}

const TASK_EMOJI: Record<TaskKind, string> = {
  compra_insumos: "🛒",
  lavado_platos: "🧽",
  orden_sede: "🧹",
  reserva_cancha: "⚽",
};

/** «Carne (3 kg)»: el insumo con su cantidad si la tiene. */
export function itemWithQuantity(itemName: string | null | undefined, quantity: string | null | undefined) {
  const name = capitalizeFirst(itemName ?? "") || UNNAMED_ITEM_LABEL;
  return quantity ? `${name} (${quantity})` : name;
}

/**
 * El mensaje de WhatsApp con quién se ocupa de qué (misma gente, mismo orden y mismos nombres que
 * la pantalla). Las tareas sin nadie dicen «Sin asignar» para que se note lo que falta. Si no hay
 * ninguna asignación devuelve `null`: no hay nada que compartir.
 */
export function buildTasksShareText({
  eventName,
  eventDateLabel,
  eventUrl,
  tasks,
}: {
  eventName: string;
  eventDateLabel: string;
  eventUrl: string;
  tasks: ShareTask[];
}): string | null {
  if (tasks.every((task) => task.rows.length === 0)) return null;

  const lines = [`📋 *Tareas — ${eventName}*`, `📅 ${eventDateLabel}`];
  for (const task of tasks) {
    lines.push("", `${TASK_EMOJI[task.type]} *${task.label}*`);
    if (task.rows.length === 0) {
      lines.push("Sin asignar");
      continue;
    }
    for (const group of groupByPerson(task.rows)) {
      const name = group.rows[0].userName;
      lines.push(
        task.type === "compra_insumos"
          ? `• ${name}: ${group.rows.map((r) => itemWithQuantity(r.itemName, r.quantity)).join(", ")}`
          : `• ${name}`,
      );
    }
  }
  lines.push("", `Más detalles: ${eventUrl}`);
  return lines.join("\n");
}
