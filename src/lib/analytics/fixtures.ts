// Constructores de filas para los tests de Analytics: lo mínimo para armar un
// escenario sin repetir campos que cada test no usa. Solo lo importan tests.

import type {
  AnalyticsInput,
  EventRow,
  ExpenseRow,
  FutbolRow,
  GuestRow,
  MemberRow,
  PaymentRow,
  RsvpKind,
  RsvpRow,
  RsvpStatus,
  TaskRow,
  TaskType,
} from "./types";

export const NOW = new Date("2026-10-28T12:00:00Z");

export function member(id: string, joinedAt = "2026-01-01T00:00:00Z"): MemberRow {
  return { id, name: id.toUpperCase(), avatarUrl: null, joinedAt };
}

export function event(
  id: string,
  eventDate: string,
  extra: Partial<Pick<EventRow, "hasFutbol" | "groupId" | "name" | "location" | "createdBy">> = {},
): EventRow {
  return {
    id,
    name: extra.name ?? `Evento ${id}`,
    eventDate,
    location: extra.location ?? null,
    hasFutbol: extra.hasFutbol ?? false,
    groupId: extra.groupId ?? null,
    createdBy: extra.createdBy ?? null,
  };
}

export function rsvp(
  eventId: string,
  userId: string,
  status: RsvpStatus,
  kind: RsvpKind = "juntada",
): RsvpRow {
  return { eventId, userId, kind, status };
}

export function guest(
  eventId: string,
  guestId: string,
  broughtBy = "a",
  kind: RsvpKind = "juntada",
): GuestRow {
  return { eventId, guestId, kind, broughtBy };
}

// `shares` es `[userId, monto][]`: si no se pasa, el gasto se divide en partes
// iguales entre `among`.
export function expense(
  id: string,
  groupId: string,
  paidBy: string,
  amount: number,
  among: string[] | [string, number][],
): ExpenseRow {
  const shares = among.map((s) =>
    Array.isArray(s) ? { userId: s[0], amount: s[1] } : { userId: s, amount: amount / among.length },
  );
  return { id, groupId, paidBy, amount, shares };
}

export function payment(groupId: string, from: string, to: string, amount: number): PaymentRow {
  return { groupId, from, to, amount };
}

export function futbol(
  eventId: string,
  extra: Partial<Omit<FutbolRow, "eventId">> = {},
): FutbolRow {
  return {
    eventId,
    resultado: extra.resultado ?? null,
    mvpUserId: extra.mvpUserId ?? null,
    goleadorUserId: extra.goleadorUserId ?? null,
  };
}

export function task(eventId: string, taskType: TaskType, userId: string): TaskRow {
  return { eventId, taskType, userId };
}

// Un escenario chico y calculable a mano:
//  · 4 miembros (d se une el 10/10, después de los dos primeros eventos).
//  · e1 (18/9, con fútbol), e2 (2/10, con fútbol) y e3 (16/10) ya pasaron; e4 (30/10) es el próximo.
//  · Cada evento pasado tiene su grupo de gastos.
export const baseInput = (): AnalyticsInput => ({
  now: NOW,
  members: [member("a"), member("b"), member("c"), member("d", "2026-10-10T00:00:00Z")],
  events: [
    event("e1", "2026-09-18T19:30:00Z", { hasFutbol: true, groupId: "g1", createdBy: "a" }),
    event("e2", "2026-10-02T20:00:00Z", { hasFutbol: true, groupId: "g2", createdBy: "b" }),
    event("e3", "2026-10-16T19:20:00Z", { groupId: "g3", createdBy: "a" }),
    event("e4", "2026-10-30T20:00:00Z", { hasFutbol: true, groupId: "g4", createdBy: "c" }),
  ],
  rsvps: [
    // e1: a y b van, c dice que no → 2 de 3 elegibles (d todavía no era miembro)
    rsvp("e1", "a", "yes"),
    rsvp("e1", "b", "yes"),
    rsvp("e1", "c", "no"),
    rsvp("e1", "a", "yes", "futbol"),
    // e2: solo a va → 1 de 3
    rsvp("e2", "a", "yes"),
    rsvp("e2", "b", "maybe"),
    // e3: a, b y d van → 3 de 4
    rsvp("e3", "a", "yes"),
    rsvp("e3", "b", "yes"),
    rsvp("e3", "d", "yes"),
    // e4 (próximo): a y c confirmaron
    rsvp("e4", "a", "yes"),
    rsvp("e4", "c", "yes"),
  ],
  guests: [guest("e1", "g-1", "a"), guest("e3", "g-2", "b"), guest("e3", "g-3", "b")],
  expenses: [
    // e1: $300 en total, la mayor la pone a
    expense("x1", "g1", "a", 200, ["a", "b", "c"]),
    expense("x2", "g1", "b", 100, ["a", "b", "c"]),
    // e2: $120
    expense("x3", "g2", "a", 120, ["a", "b", "c"]),
    // e3: sin gastos cargados (g3 vacío)
    // e4: ya hay una compra para el próximo
    expense("x4", "g4", "c", 999, ["a", "c"]),
  ],
  payments: [payment("g1", "c", "a", 40)],
  futbol: [
    futbol("e1", { resultado: "4-9", mvpUserId: "a", goleadorUserId: "b" }),
    futbol("e2", { mvpUserId: "a" }),
    futbol("e4", { mvpUserId: "c" }),
  ],
  tasks: [
    // e1: a compra dos insumos (cuenta una vez), b lava los platos, c reserva la cancha
    task("e1", "compra_insumos", "a"),
    task("e1", "compra_insumos", "a"),
    task("e1", "lavado_platos", "b"),
    task("e1", "reserva_cancha", "c"),
    // e2: a compra, b ordena la sede
    task("e2", "compra_insumos", "a"),
    task("e2", "orden_sede", "b"),
    // e4 (próximo): todavía no pasó, no cuenta
    task("e4", "compra_insumos", "a"),
  ],
});
