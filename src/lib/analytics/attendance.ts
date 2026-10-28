// Asistencia para Analytics (spec 021): por evento (cuántos confirmaron y
// qué proporción es de los que podían) y por miembro (reusa
// `calcularAsistencia`, el mismo cálculo de /miembros y /perfil).
//
// «Asistencia» es CONFIRMACIÓN: no hay check-in, lo único que existe es el
// «Voy» de la juntada y del fútbol.

import { calcularAsistencia, type RsvpForAttendance } from "@/lib/eventos/attendance";
import { fraction } from "./stats";
import type {
  AttendanceCount,
  EventAttendance,
  EventRow,
  GuestRow,
  MemberEventStatus,
  MemberRow,
  RsvpBreakdown,
  RsvpKind,
  RsvpRow,
  RsvpStatus,
} from "./types";

export function isPast(eventDate: string, now: Date): boolean {
  return new Date(eventDate) < now;
}

// Un miembro «cuenta» para un evento si ya lo era a esa fecha (mismo criterio
// que `contarEventosElegibles`: no se lo penaliza por eventos anteriores a su
// alta) o si respondió igual. Así una confirmación nunca queda afuera del
// denominador y el ratio no pasa de 100 %.
function isEligible(joinedAt: string, eventDate: string, responded: boolean): boolean {
  return responded || new Date(joinedAt) <= new Date(eventDate);
}

function statusesOf(rsvps: readonly RsvpRow[], match: (r: RsvpRow) => boolean) {
  const byKind: Record<RsvpKind, Map<string, RsvpStatus>> = {
    juntada: new Map(),
    futbol: new Map(),
  };
  for (const r of rsvps) {
    if (match(r)) byKind[r.kind].set(r.userId, r.status);
  }
  return byKind;
}

function breakdown(
  eligible: ReadonlySet<string>,
  statuses: ReadonlyMap<string, RsvpStatus>,
): RsvpBreakdown {
  let confirmed = 0;
  let declined = 0;
  let maybe = 0;
  let responded = 0;
  for (const userId of eligible) {
    const status = statuses.get(userId);
    if (!status) continue;
    responded++;
    if (status === "yes") confirmed++;
    else if (status === "no") declined++;
    else maybe++;
  }
  return { confirmed, declined, maybe, noResponse: eligible.size - responded };
}

function countGuests(guests: readonly GuestRow[], eventId: string, kind: RsvpKind): number {
  const ids = new Set<string>();
  for (const g of guests) {
    if (g.eventId === eventId && g.kind === kind) ids.add(g.guestId);
  }
  return ids.size;
}

export function buildEventAttendance(
  event: EventRow,
  members: readonly MemberRow[],
  rsvps: readonly RsvpRow[],
  guests: readonly GuestRow[],
): EventAttendance {
  const statuses = statusesOf(rsvps, (r) => r.eventId === event.id);
  const eligible = new Set<string>([...statuses.juntada.keys(), ...statuses.futbol.keys()]);
  for (const m of members) {
    if (isEligible(m.joinedAt, event.eventDate, false)) eligible.add(m.id);
  }

  const juntada = breakdown(eligible, statuses.juntada);
  const guestCount = countGuests(guests, event.id, "juntada");

  return {
    ...juntada,
    eligible: eligible.size,
    ratio: fraction(juntada.confirmed, eligible.size),
    guests: guestCount,
    guestsPerConfirmed: fraction(guestCount, juntada.confirmed),
    futbol: event.hasFutbol
      ? (() => {
          const futbol = breakdown(eligible, statuses.futbol);
          return {
            ...futbol,
            ratio: fraction(futbol.confirmed, eligible.size),
            guests: countGuests(guests, event.id, "futbol"),
          };
        })()
      : null,
  };
}

export interface MemberAttendance {
  juntada: AttendanceCount;
  futbol: AttendanceCount;
  eligibleEvents: { juntada: number; futbol: number };
  streak: number;
  /** Eventos pasados desde que es miembro, del más reciente al más viejo. */
  byEvent: { eventId: string; juntada: MemberEventStatus; futbol: MemberEventStatus | null }[];
}

function toCount(stats: { asistencias: number; ausencias: number }): AttendanceCount {
  return {
    attended: stats.asistencias,
    absent: stats.ausencias,
    ratio: fraction(stats.asistencias, stats.asistencias + stats.ausencias),
  };
}

// `pastEvents` son SOLO los eventos que ya pasaron. Las respuestas a eventos
// futuros no cuentan: una confirmación para el viernes que viene todavía no
// es una asistencia. La elegibilidad es la misma regla que en
// `buildEventAttendance`, así que por evento y por miembro los números cierran.
export function buildMemberAttendance(
  member: MemberRow,
  pastEvents: readonly EventRow[],
  rsvps: readonly RsvpRow[],
): MemberAttendance {
  const mine = new Map<string, { juntada?: RsvpStatus; futbol?: RsvpStatus }>();
  for (const r of rsvps) {
    if (r.userId !== member.id) continue;
    const entry = mine.get(r.eventId) ?? {};
    entry[r.kind] = r.status;
    mine.set(r.eventId, entry);
  }

  const eligible = pastEvents
    .filter((e) => isEligible(member.joinedAt, e.eventDate, mine.has(e.id)))
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

  // Solo se alimenta a `calcularAsistencia` con lo de los eventos elegibles:
  // sus «sin respuesta» salen de restar lo respondido a lo elegible.
  const forAttendance: RsvpForAttendance[] = [];
  for (const e of eligible) {
    const entry = mine.get(e.id);
    if (entry?.juntada) forAttendance.push({ kind: "juntada", status: entry.juntada });
    if (e.hasFutbol && entry?.futbol) forAttendance.push({ kind: "futbol", status: entry.futbol });
  }
  const eligibleEvents = {
    juntada: eligible.length,
    futbol: eligible.filter((e) => e.hasFutbol).length,
  };
  const attendance = calcularAsistencia(forAttendance, eligibleEvents);

  // Racha: eventos seguidos con «Voy», contando desde el más reciente.
  let streak = 0;
  for (const e of eligible) {
    if (mine.get(e.id)?.juntada !== "yes") break;
    streak++;
  }

  return {
    juntada: toCount(attendance.juntada),
    futbol: toCount(attendance.futbol),
    eligibleEvents,
    streak,
    byEvent: eligible.map((e) => {
      const entry = mine.get(e.id);
      return {
        eventId: e.id,
        juntada: entry?.juntada ?? "none",
        futbol: e.hasFutbol ? (entry?.futbol ?? "none") : null,
      };
    }),
  };
}
