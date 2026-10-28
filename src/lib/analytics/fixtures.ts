// Constructores de filas para los tests de Analytics: lo mínimo para armar un
// escenario sin repetir campos que cada test no usa. Solo lo importan tests.

import type {
  EventRow,
  ExpenseRow,
  FutbolRow,
  GuestRow,
  MemberRow,
  PaymentRow,
  RsvpKind,
  RsvpRow,
  RsvpStatus,
} from "./types";

export const NOW = new Date("2026-10-28T12:00:00Z");

export function member(id: string, joinedAt = "2026-01-01T00:00:00Z"): MemberRow {
  return { id, name: id.toUpperCase(), avatarUrl: null, joinedAt };
}

export function event(
  id: string,
  eventDate: string,
  extra: Partial<Pick<EventRow, "hasFutbol" | "groupId" | "name" | "location">> = {},
): EventRow {
  return {
    id,
    name: extra.name ?? `Evento ${id}`,
    eventDate,
    location: extra.location ?? null,
    hasFutbol: extra.hasFutbol ?? false,
    groupId: extra.groupId ?? null,
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
