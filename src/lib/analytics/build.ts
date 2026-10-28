// Arma toda la sección Analytics (spec 021) a partir de filas planas: es una
// función pura (el reloj entra por `input.now`), así que se prueba con fixtures
// y la misma entrada da siempre la misma salida.
//
// Regla de oro: «evento pasado» es `event_date < now`. Los eventos futuros
// NUNCA entran en promedios, series de comparación, rankings ni totales; solo el
// más próximo se informa aparte («en curso»).

import { buildEventAttendance, buildMemberAttendance, isPast } from "./attendance";
import { buildEventFutbol, countAwards } from "./football";
import { buildEventSpending, itemStats } from "./spending";
import { compareAt, fraction, roundTo, sum, summarizeSeries, type PointComparison } from "./stats";
import type {
  Analytics,
  AnalyticsInput,
  EventAnalytics,
  EventMetricKey,
  EventRow,
  EventSpending,
  ExpenseRow,
  GeneralAnalytics,
  MemberAnalytics,
  MemberEventRow,
  MetricComparison,
  PaymentRow,
  RankingRow,
  SeriesPoint,
} from "./types";

// Con menos eventos pasados que esto no se dibujan tendencias ni medianas entre
// eventos: dos puntos no son una tendencia.
export const MIN_EVENTS_FOR_TRENDS = 3;
// Para figurar entre «los más fieles» hacen falta al menos estos eventos
// elegibles: 1 de 1 no dice nada.
export const MIN_EVENTS_FOR_FAITHFUL = 2;

const METRIC_KEYS: EventMetricKey[] = ["confirmed", "ratio", "total", "costPerPerson", "medianItem"];

function time(event: EventRow): number {
  return new Date(event.eventDate).getTime();
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row)) ?? [];
    list.push(row);
    map.set(key(row), list);
  }
  return map;
}

function toMetricComparison(c: PointComparison, past: readonly EventRow[]): MetricComparison {
  return {
    value: c.value,
    vsPrevious: c.vsPrevious,
    vsAverage: c.vsAverage,
    previousEventId: c.previousIndex === null ? null : past[c.previousIndex].id,
    others: c.others,
  };
}

function byNameThen(
  a: { name: string },
  b: { name: string },
): number {
  return a.name.localeCompare(b.name, "es");
}

export function buildAnalytics(input: AnalyticsInput): Analytics {
  const { now, members, rsvps, guests } = input;

  const chronological = [...input.events].sort((a, b) => time(a) - time(b));
  const past = chronological.filter((e) => isPast(e.eventDate, now));
  const next = chronological.find((e) => !isPast(e.eventDate, now)) ?? null;
  const pastIds = new Set(past.map((e) => e.id));

  const expensesByGroup = groupBy<ExpenseRow>(input.expenses, (e) => e.groupId);
  const paymentsByGroup = groupBy<PaymentRow>(input.payments, (p) => p.groupId);
  const spendingOf = (event: EventRow): EventSpending | null =>
    event.groupId
      ? buildEventSpending(
          expensesByGroup.get(event.groupId) ?? [],
          paymentsByGroup.get(event.groupId) ?? [],
        )
      : null;

  const core = (event: EventRow) => ({
    attendance: buildEventAttendance(event, members, rsvps, guests),
    spending: spendingOf(event),
    futbol: buildEventFutbol(input.futbol, event.id),
  });
  const pastCore = past.map(core);

  // ─── Series por evento pasado, en orden cronológico ───
  const valueOf: Record<EventMetricKey, (c: (typeof pastCore)[number]) => number | null> = {
    confirmed: (c) => c.attendance.confirmed,
    ratio: (c) => c.attendance.ratio,
    total: (c) => c.spending?.total ?? null,
    costPerPerson: (c) => c.spending?.costPerPerson ?? null,
    medianItem: (c) => c.spending?.median ?? null,
  };
  const series = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, pastCore.map(valueOf[key])]),
  ) as Record<EventMetricKey, (number | null)[]>;

  // ─── Eventos ───
  const pastEvents: EventAnalytics[] = past.map((event, i) => ({
    id: event.id,
    name: event.name,
    eventDate: event.eventDate,
    location: event.location,
    hasFutbol: event.hasFutbol,
    status: "past",
    ...pastCore[i],
    comparisons: Object.fromEntries(
      METRIC_KEYS.map((key) => [key, toMetricComparison(compareAt(series[key], i), past)]),
    ) as Record<EventMetricKey, MetricComparison>,
  }));

  const nextCore = next ? core(next) : null;
  const nextEvent: EventAnalytics | null =
    next && nextCore
      ? {
          id: next.id,
          name: next.name,
          eventDate: next.eventDate,
          location: next.location,
          hasFutbol: next.hasFutbol,
          status: "next",
          ...nextCore,
          // Un evento que todavía no pasó no se compara: le falta la mitad de los datos.
          comparisons: Object.fromEntries(
            METRIC_KEYS.map((key) => [
              key,
              { value: valueOf[key](nextCore), vsPrevious: null, vsAverage: null, previousEventId: null, others: 0 },
            ]),
          ) as Record<EventMetricKey, MetricComparison>,
        }
      : null;

  // ─── Miembros ───
  const awards = countAwards(input.futbol, pastIds);
  const guestsByMember = groupBy(
    guests.filter((g) => pastIds.has(g.eventId)),
    (g) => g.broughtBy,
  );
  const pastSpending = past.map((event, i) => ({ event, spending: pastCore[i].spending }));

  const memberAnalytics: MemberAnalytics[] = members.map((m) => {
    const attendance = buildMemberAttendance(m, past, rsvps);

    let paid = 0;
    let consumed = 0;
    let balance = 0;
    let eventsPaid = 0;
    let eventsConsumed = 0;
    const moneyByEvent = new Map<string, { paid: number; consumed: number }>();
    for (const { event, spending } of pastSpending) {
      const row = spending?.byMember.find((r) => r.userId === m.id);
      if (!row) continue;
      paid += row.paid;
      consumed += row.consumed;
      balance += row.balance;
      if (row.paid > 0) eventsPaid++;
      if (row.consumed > 0) eventsConsumed++;
      moneyByEvent.set(event.id, row);
    }

    const attendanceByEvent = new Map(attendance.byEvent.map((r) => [r.eventId, r]));
    // Los eventos donde participó: los de su asistencia más cualquiera donde
    // puso o consumió algo, para que la lista siempre cierre con sus totales.
    const byEvent: MemberEventRow[] = [...past]
      .reverse()
      .filter((e) => attendanceByEvent.has(e.id) || moneyByEvent.has(e.id))
      .map((e) => {
        const att = attendanceByEvent.get(e.id);
        const money = moneyByEvent.get(e.id);
        return {
          eventId: e.id,
          name: e.name,
          eventDate: e.eventDate,
          juntada: att?.juntada ?? "none",
          futbol: e.hasFutbol ? (att?.futbol ?? "none") : null,
          paid: money?.paid ?? 0,
          consumed: money?.consumed ?? 0,
        };
      });

    return {
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      joinedAt: m.joinedAt,
      juntada: attendance.juntada,
      futbol: attendance.futbol,
      eligibleEvents: attendance.eligibleEvents,
      streak: attendance.streak,
      guestsBrought: new Set((guestsByMember.get(m.id) ?? []).map((g) => `${g.eventId}:${g.guestId}`)).size,
      money: {
        paid: roundTo(paid),
        consumed: roundTo(consumed),
        net: roundTo(paid - consumed),
        eventsPaid,
        eventsConsumed,
        avgConsumed: eventsConsumed > 0 ? roundTo(consumed / eventsConsumed) : null,
        balance: roundTo(balance),
      },
      mvp: awards.get(m.id)?.mvp ?? 0,
      goleador: awards.get(m.id)?.goleador ?? 0,
      byEvent,
    };
  });

  // ─── General ───
  const spendings = pastCore.flatMap((c) => (c.spending ? [c.spending] : []));
  // Solo quienes pusieron plata: `byMember` también trae a quien solo consumió.
  const paidByPerson = new Map<string, number>();
  for (const s of spendings) {
    for (const row of s.byMember) {
      if (row.paid > 0) paidByPerson.set(row.userId, (paidByPerson.get(row.userId) ?? 0) + row.paid);
    }
  }
  const totalSpent = roundTo(sum(spendings.map((s) => s.total)));
  const topPaid = Math.max(0, ...paidByPerson.values());

  const seriesPoints: SeriesPoint[] = [
    ...pastEvents.map((e) => ({ event: e, isNext: false })),
    ...(nextEvent ? [{ event: nextEvent, isNext: true }] : []),
  ].map(({ event, isNext }) => ({
    eventId: event.id,
    name: event.name,
    eventDate: event.eventDate,
    isNext,
    confirmed: event.attendance.confirmed,
    ratio: event.attendance.ratio,
    total: event.spending?.total ?? null,
    costPerPerson: event.spending?.costPerPerson ?? null,
  }));

  const attendedEver = new Set(
    rsvps
      .filter((r) => pastIds.has(r.eventId) && r.kind === "juntada" && r.status === "yes")
      .map((r) => r.userId),
  );

  const contributors: RankingRow[] = memberAnalytics
    .filter((m) => m.money.paid > 0)
    .sort((a, b) => b.money.paid - a.money.paid || byNameThen(a, b))
    .map((m) => ({ userId: m.id, value: m.money.paid }));

  const faithful: RankingRow[] = memberAnalytics
    .filter((m) => m.eligibleEvents.juntada >= MIN_EVENTS_FOR_FAITHFUL && m.juntada.ratio !== null)
    .sort(
      (a, b) =>
        (b.juntada.ratio as number) - (a.juntada.ratio as number) ||
        b.juntada.attended - a.juntada.attended ||
        byNameThen(a, b),
    )
    .map((m) => ({ userId: m.id, value: m.juntada.ratio as number }));

  const awardRanking = (key: "mvp" | "goleador"): RankingRow[] =>
    memberAnalytics
      .filter((m) => m[key] > 0)
      .sort((a, b) => b[key] - a[key] || byNameThen(a, b))
      .map((m) => ({ userId: m.id, value: m[key] }));

  const general: GeneralAnalytics = {
    pastEvents: past.length,
    sample: past.length === 0 ? "none" : past.length < MIN_EVENTS_FOR_TRENDS ? "small" : "enough",
    members: members.length,
    attendance: {
      confirmed: summarizeSeries(series.confirmed),
      ratio: summarizeSeries(series.ratio),
      confirmations: sum(pastCore.map((c) => c.attendance.confirmed)),
      guests: sum(pastCore.map((c) => c.attendance.guests)),
      distinctAttendees: attendedEver.size,
    },
    spending: {
      eventsWithExpenses: spendings.length,
      total: totalSpent,
      perEvent: summarizeSeries(series.total),
      costPerPerson: summarizeSeries(series.costPerPerson),
      items: itemStats(
        past.flatMap((e) => (e.groupId ? (expensesByGroup.get(e.groupId) ?? []) : [])).map((x) => x.amount),
      ),
      payers: paidByPerson.size,
      topPayerShare: fraction(topPaid, totalSpent),
      pending: roundTo(sum(spendings.map((s) => s.pending))),
    },
    series: seriesPoints,
    rankings: {
      contributors,
      faithful,
      mvps: awardRanking("mvp"),
      goleadores: awardRanking("goleador"),
    },
  };

  return {
    now: now.toISOString(),
    general,
    events: [...(nextEvent ? [nextEvent] : []), ...[...pastEvents].reverse()],
    members: memberAnalytics,
  };
}
