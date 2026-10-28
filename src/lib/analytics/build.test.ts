import { describe, expect, it } from "vitest";
import { buildAnalytics, MIN_EVENTS_FOR_TRENDS } from "./build";
import { NOW, event, expense, futbol, guest, member, payment, rsvp } from "./fixtures";
import type { AnalyticsInput } from "./types";

// Un escenario chico y calculable a mano:
//  · 4 miembros (d se une el 10/10, después de los dos primeros eventos).
//  · e1 (18/9, con fútbol), e2 (2/10, con fútbol) y e3 (16/10) ya pasaron; e4 (30/10) es el próximo.
//  · Cada evento pasado tiene su grupo de gastos.
const base = (): AnalyticsInput => ({
  now: NOW,
  members: [member("a"), member("b"), member("c"), member("d", "2026-10-10T00:00:00Z")],
  events: [
    event("e1", "2026-09-18T19:30:00Z", { hasFutbol: true, groupId: "g1" }),
    event("e2", "2026-10-02T20:00:00Z", { hasFutbol: true, groupId: "g2" }),
    event("e3", "2026-10-16T19:20:00Z", { groupId: "g3" }),
    event("e4", "2026-10-30T20:00:00Z", { hasFutbol: true, groupId: "g4" }),
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
});

describe("buildAnalytics · eventos", () => {
  const result = buildAnalytics(base());
  const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));

  it("el próximo va primero y los pasados del más reciente al más viejo", () => {
    expect(result.events.map((e) => e.id)).toEqual(["e4", "e3", "e2", "e1"]);
    expect(byId.e4.status).toBe("next");
    expect(byId.e3.status).toBe("past");
  });

  it("asistencia de cada evento pasado", () => {
    expect(byId.e1.attendance).toMatchObject({ eligible: 3, confirmed: 2, declined: 1, noResponse: 0, ratio: 2 / 3 });
    expect(byId.e2.attendance).toMatchObject({ eligible: 3, confirmed: 1, maybe: 1, noResponse: 1, ratio: 1 / 3 });
    expect(byId.e3.attendance).toMatchObject({ eligible: 4, confirmed: 3, noResponse: 1, ratio: 3 / 4 });
    expect(byId.e3.attendance.guests).toBe(2);
    expect(byId.e1.attendance.futbol).toMatchObject({ confirmed: 1, ratio: 1 / 3 });
    expect(byId.e3.attendance.futbol).toBeNull();
  });

  it("gastos de cada evento; sin gastos cargados es null, no cero", () => {
    expect(byId.e1.spending).toMatchObject({ total: 300, costPerPerson: 100, median: 150, max: 200, people: 3 });
    expect(byId.e2.spending).toMatchObject({ total: 120, costPerPerson: 40, median: 120 });
    expect(byId.e3.spending).toBeNull();
  });

  it("los pagos de deuda de ese evento bajan su pendiente", () => {
    // e1: a puso 200 y consumió 100 (le deben 100); c le pagó 40 → le deben 60.
    expect(byId.e1.spending?.byMember.find((m) => m.userId === "a")?.balance).toBe(60);
    expect(byId.e1.spending?.pending).toBe(60);
    // e2: a puso 120 y consumió 40 (le deben 80) y nadie pagó todavía.
    expect(byId.e2.spending?.pending).toBe(80);
  });

  it("fútbol del evento", () => {
    expect(byId.e1.futbol).toEqual({ resultado: "4-9", mvpUserId: "a", goleadorUserId: "b" });
    expect(byId.e3.futbol).toBeNull();
  });

  it("comparativas: contra el evento anterior y contra el promedio de los otros pasados", () => {
    // confirmados por evento: 2, 1, 3
    expect(byId.e3.comparisons.confirmed).toMatchObject({
      value: 3,
      previousEventId: "e2",
      others: 2,
      vsPrevious: { base: 1, diff: 2, pct: 2 },
      vsAverage: { base: 1.5, diff: 1.5, pct: 1 },
    });
    expect(byId.e1.comparisons.confirmed.vsPrevious).toBeNull();
    expect(byId.e1.comparisons.confirmed.vsAverage).toMatchObject({ base: 2 });
  });

  it("un evento sin gastos queda fuera de las comparativas de gasto y se salta como «anterior»", () => {
    // total por evento: 300, 120, null
    expect(byId.e3.comparisons.total).toEqual({
      value: null,
      vsPrevious: null,
      vsAverage: null,
      previousEventId: null,
      others: 0,
    });
    expect(byId.e2.comparisons.total).toMatchObject({
      value: 120,
      previousEventId: "e1",
      vsPrevious: { base: 300, diff: -180, pct: -0.6 },
    });
    // el promedio del resto de los gastos de e2 no cuenta a e3 (sin dato)
    expect(byId.e2.comparisons.total.others).toBe(1);
  });

  it("el próximo evento se informa pero NO se compara ni entra en las otras comparativas", () => {
    expect(byId.e4.attendance).toMatchObject({ eligible: 4, confirmed: 2, ratio: 0.5 });
    expect(byId.e4.spending?.total).toBe(999);
    expect(byId.e4.comparisons.confirmed).toEqual({
      value: 2,
      vsPrevious: null,
      vsAverage: null,
      previousEventId: null,
      others: 0,
    });
    // ni el gasto del próximo (999) ni sus confirmados mueven a los pasados
    expect(byId.e3.comparisons.total.vsAverage).toBeNull();
    expect(byId.e2.comparisons.total.vsAverage?.base).toBe(300);
  });
});

describe("buildAnalytics · general", () => {
  const { general } = buildAnalytics(base());

  it("cuenta solo los eventos pasados y avisa si la muestra es chica", () => {
    expect(general.pastEvents).toBe(3);
    expect(general.sample).toBe("enough");
    expect(general.members).toBe(4);
    expect(MIN_EVENTS_FOR_TRENDS).toBe(3);
  });

  it("asistencia: promedio y mediana sobre los pasados, sin el próximo", () => {
    expect(general.attendance.confirmed).toMatchObject({ n: 3, mean: 2, median: 2, min: 1, max: 3, latest: 3 });
    expect(general.attendance.confirmations).toBe(6);
    expect(general.attendance.guests).toBe(3);
    expect(general.attendance.ratio.mean).toBeCloseTo((2 / 3 + 1 / 3 + 3 / 4) / 3, 9);
    // a, b y d confirmaron a alguna juntada pasada; c solo dijo «no»
    expect(general.attendance.distinctAttendees).toBe(3);
  });

  it("gasto: total, por evento, costo por persona y gasto por ítem (solo pasados)", () => {
    expect(general.spending.eventsWithExpenses).toBe(2);
    expect(general.spending.total).toBe(420);
    expect(general.spending.perEvent).toMatchObject({ n: 2, mean: 210, median: 210, latest: 120 });
    expect(general.spending.costPerPerson).toMatchObject({ n: 2, mean: 70, latest: 40 });
    expect(general.spending.items).toEqual({ count: 3, mean: 140, median: 120, max: 200 });
    // el pendiente es el de los eventos pasados: e1 60 + e2 80
    expect(general.spending.pending).toBe(140);
  });

  it("aportes: cuántos pusieron y qué parte puso el que más puso", () => {
    // a puso 200 + 120 = 320 de 420; b puso 100
    expect(general.spending.payers).toBe(2);
    expect(general.spending.topPayerShare).toBeCloseTo(320 / 420, 9);
  });

  it("la serie del gráfico va en orden, con el próximo marcado al final", () => {
    expect(general.series.map((p) => [p.eventId, p.isNext])).toEqual([
      ["e1", false],
      ["e2", false],
      ["e3", false],
      ["e4", true],
    ]);
    expect(general.series[2]).toMatchObject({ confirmed: 3, total: null, costPerPerson: null });
    expect(general.series[3]).toMatchObject({ confirmed: 2, total: 999 });
  });

  it("rankings: quienes más ponen, los más fieles y los premios", () => {
    expect(general.rankings.contributors).toEqual([
      { userId: "a", value: 320 },
      { userId: "b", value: 100 },
    ]);
    expect(general.rankings.mvps).toEqual([{ userId: "a", value: 2 }]);
    expect(general.rankings.goleadores).toEqual([{ userId: "b", value: 1 }]);
  });

  it("los más fieles: por ratio, con al menos 2 eventos elegibles", () => {
    // a y b tienen 100 % (el «tal vez» de b no suma ni resta), pero a fue a más
    // eventos; c tiene 0 %. d solo es elegible a 1 evento: no entra.
    expect(general.rankings.faithful).toEqual([
      { userId: "a", value: 1 },
      { userId: "b", value: 1 },
      { userId: "c", value: 0 },
    ]);
  });
});

describe("buildAnalytics · los más fieles (bordes)", () => {
  it("entra quien tiene exactamente 2 eventos elegibles; con 1 no", () => {
    const input = base();
    const { general } = buildAnalytics({
      ...input,
      // e se une entre e1 y e2: es elegible a e2 y e3 (2 eventos)
      members: [...input.members, member("e", "2026-10-01T00:00:00Z")],
      rsvps: [...input.rsvps, rsvp("e2", "e", "yes"), rsvp("e3", "e", "yes")],
    });
    const ids = general.rankings.faithful.map((r) => r.userId);
    expect(ids).toContain("e");
    expect(ids).not.toContain("d");
  });
});

describe("buildAnalytics · miembros", () => {
  const { members } = buildAnalytics(base());
  const m = Object.fromEntries(members.map((x) => [x.id, x]));

  it("asistencia por miembro, sobre los eventos pasados desde que se unió", () => {
    expect(m.a.juntada).toEqual({ attended: 3, absent: 0, ratio: 1 });
    expect(m.a.eligibleEvents).toEqual({ juntada: 3, futbol: 2 });
    // b: e1 sí, e2 tal vez (no suma ni resta), e3 sí
    expect(m.b.juntada).toEqual({ attended: 2, absent: 0, ratio: 1 });
    // c: e1 no, e2 sin respuesta, e3 sin respuesta
    expect(m.c.juntada).toEqual({ attended: 0, absent: 3, ratio: 0 });
    // d se unió el 10/10: solo cuenta e3
    expect(m.d.eligibleEvents.juntada).toBe(1);
    expect(m.d.juntada).toEqual({ attended: 1, absent: 0, ratio: 1 });
  });

  it("la confirmación al evento próximo no cuenta como asistencia", () => {
    // a y c confirmaron e4, que todavía no pasó
    expect(m.c.juntada.attended).toBe(0);
    expect(m.a.juntada.attended).toBe(3);
  });

  it("racha y fútbol", () => {
    expect(m.a.streak).toBe(3);
    expect(m.b.streak).toBe(1); // e3 sí, e2 «tal vez» la corta
    expect(m.c.streak).toBe(0);
    expect(m.a.futbol).toEqual({ attended: 1, absent: 1, ratio: 0.5 });
  });

  it("aportes, consumo y neto de los eventos pasados (no cuentan los del próximo)", () => {
    // a: puso 200 + 120 = 320; consumió 100 + 40 = 140; (en e4 consumiría, pero no entra)
    expect(m.a.money).toMatchObject({ paid: 320, consumed: 140, net: 180, eventsPaid: 2, eventsConsumed: 2, avgConsumed: 70 });
    // c: puso 0 en los pasados (los 999 son del próximo)
    expect(m.c.money).toMatchObject({ paid: 0, consumed: 140, net: -140, eventsPaid: 0, eventsConsumed: 2 });
    expect(m.d.money).toMatchObject({ paid: 0, consumed: 0, avgConsumed: null, eventsConsumed: 0 });
  });

  it("saldo: lo que le deben (positivo) o debe (negativo), con los pagos de deuda", () => {
    // a: e1 +60 (después de que c pagó 40) y e2 +80.
    expect(m.a.money.balance).toBe(140);
    // b: e1 0 y e2 -40.
    expect(m.b.money.balance).toBe(-40);
    // c: e1 -60 (debía 100 y pagó 40) y e2 -40.
    expect(m.c.money.balance).toBe(-100);
  });

  it("invitados que trajo (por evento pasado)", () => {
    expect(m.a.guestsBrought).toBe(1);
    expect(m.b.guestsBrought).toBe(2);
    expect(m.c.guestsBrought).toBe(0);
  });

  it("no cuenta los invitados del evento próximo", () => {
    const input = base();
    const { members: after } = buildAnalytics({ ...input, guests: [...input.guests, guest("e4", "g-9", "a")] });
    expect(after.find((x) => x.id === "a")?.guestsBrought).toBe(1);
  });

  it("quien puso plata para los demás sin consumir nada: paga, pero no «consumió» en ese evento", () => {
    const input = base();
    const { members: after } = buildAnalytics({
      ...input,
      members: [...input.members, member("z")],
      expenses: [...input.expenses, expense("xz", "g2", "z", 90, ["a", "b", "c"])],
    });
    const z = after.find((x) => x.id === "z");
    expect(z?.money).toMatchObject({ paid: 90, consumed: 0, net: 90, eventsPaid: 1, eventsConsumed: 0, avgConsumed: null });
  });

  it("MVP y goleador solo de eventos pasados", () => {
    expect(m.a.mvp).toBe(2);
    expect(m.b.goleador).toBe(1);
    expect(m.c.mvp).toBe(0); // el MVP del próximo no cuenta
  });

  it("detalle por evento: del más reciente al más viejo, solo donde participó", () => {
    expect(m.a.byEvent.map((r) => r.eventId)).toEqual(["e3", "e2", "e1"]);
    expect(m.a.byEvent[2]).toMatchObject({ eventId: "e1", juntada: "yes", futbol: "yes", paid: 200, consumed: 100 });
    expect(m.d.byEvent.map((r) => r.eventId)).toEqual(["e3"]);
  });
});

describe("buildAnalytics · bordes", () => {
  it("sin ningún evento: todo vacío y sin romper", () => {
    const result = buildAnalytics({ ...base(), events: [], rsvps: [], expenses: [], payments: [], guests: [], futbol: [] });
    expect(result.events).toEqual([]);
    expect(result.general.sample).toBe("none");
    expect(result.general.pastEvents).toBe(0);
    expect(result.general.attendance.confirmed.n).toBe(0);
    expect(result.general.attendance.confirmed.mean).toBeNull();
    expect(result.general.spending.total).toBe(0);
    expect(result.general.spending.items.median).toBeNull();
    expect(result.general.spending.topPayerShare).toBeNull();
    expect(result.general.series).toEqual([]);
    expect(result.members.every((x) => x.juntada.ratio === null && x.byEvent.length === 0)).toBe(true);
  });

  it("solo un evento futuro: no hay pasados, pero sí un próximo", () => {
    const input = base();
    const result = buildAnalytics({ ...input, events: input.events.filter((e) => e.id === "e4") });
    expect(result.general.pastEvents).toBe(0);
    expect(result.general.sample).toBe("none");
    expect(result.events.map((e) => e.id)).toEqual(["e4"]);
    expect(result.events[0].status).toBe("next");
    expect(result.general.series).toHaveLength(1);
  });

  it("con pocos eventos pasados la muestra es chica", () => {
    const input = base();
    const result = buildAnalytics({ ...input, events: input.events.filter((e) => e.id !== "e1") });
    expect(result.general.pastEvents).toBe(2);
    expect(result.general.sample).toBe("small");
  });

  it("un solo evento pasado: no se compara con nada", () => {
    const input = base();
    const result = buildAnalytics({ ...input, events: input.events.filter((e) => e.id === "e1") });
    const e1 = result.events[0];
    expect(e1.status).toBe("past");
    expect(e1.comparisons.confirmed.vsPrevious).toBeNull();
    expect(e1.comparisons.confirmed.vsAverage).toBeNull();
    expect(e1.comparisons.total.vsAverage).toBeNull();
    expect(result.general.attendance.confirmed.vsPrevious).toBeNull();
  });

  it("varios eventos futuros: solo el más cercano es el «próximo»", () => {
    const input = base();
    const result = buildAnalytics({
      ...input,
      events: [...input.events, event("e5", "2026-11-20T20:00:00Z")],
    });
    expect(result.events.filter((e) => e.status === "next").map((e) => e.id)).toEqual(["e4"]);
    expect(result.events.map((e) => e.id)).not.toContain("e5");
  });

  it("no depende del orden en que llegan los eventos", () => {
    const input = base();
    const shuffled = buildAnalytics({ ...input, events: [...input.events].reverse() });
    expect(shuffled).toEqual(buildAnalytics(input));
  });

  it("un evento ya pasado a las 12:00 exactas de ahora todavía es «próximo» (no pasó)", () => {
    const input = base();
    const result = buildAnalytics({
      ...input,
      events: [event("hoy", NOW.toISOString())],
      rsvps: [],
      expenses: [],
      payments: [],
    });
    expect(result.events[0].status).toBe("next");
  });

  it("el ratio nunca pasa de 100 % aunque confirme quien se unió después", () => {
    const input = base();
    const result = buildAnalytics({
      ...input,
      members: [member("a", "2026-10-30T00:00:00Z")],
      events: [event("e1", "2026-09-18T19:30:00Z")],
      rsvps: [rsvp("e1", "a", "yes")],
      expenses: [],
      payments: [],
      guests: [],
      futbol: [],
    });
    expect(result.events[0].attendance.ratio).toBe(1);
  });

  it("sin miembros ni respuestas el ratio es null, no NaN", () => {
    const result = buildAnalytics({
      ...base(),
      members: [],
      events: [event("e1", "2026-09-18T19:30:00Z")],
      rsvps: [],
      expenses: [],
      payments: [],
      guests: [],
      futbol: [],
    });
    expect(result.events[0].attendance.ratio).toBeNull();
    expect(result.general.attendance.ratio.mean).toBeNull();
  });
});
