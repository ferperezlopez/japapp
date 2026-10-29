import { describe, expect, it } from "vitest";
import { buildAnalytics, MIN_EVENTS_FOR_TRENDS } from "./build";
import { NOW, baseInput as base, event, expense, guest, member, rsvp } from "./fixtures";

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

  it("gasto: total, por evento y costo por persona (solo pasados)", () => {
    expect(general.spending.eventsWithExpenses).toBe(2);
    expect(general.spending.total).toBe(420);
    expect(general.spending.perEvent).toMatchObject({ n: 2, mean: 210, median: 210, latest: 120 });
    expect(general.spending.costPerPerson).toMatchObject({ n: 2, mean: 70, latest: 40 });
    // el pendiente es el de los eventos pasados: e1 60 + e2 80
    expect(general.spending.pending).toBe(140);
  });

  it("la serie del gráfico va en orden, con el próximo marcado al final y el tipo de cada evento", () => {
    expect(general.series.map((p) => [p.eventId, p.isNext])).toEqual([
      ["e1", false],
      ["e2", false],
      ["e3", false],
      ["e4", true],
    ]);
    expect(general.series.map((p) => p.hasFutbol)).toEqual([true, true, false, true]);
    expect(general.series[2]).toMatchObject({ confirmed: 3, total: null, costPerPerson: null });
    expect(general.series[3]).toMatchObject({ confirmed: 2, total: 999 });
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

  it("lo que le tocó de los eventos pasados (no cuentan los del próximo)", () => {
    // a: consumió 100 + 40 = 140 (en e4 consumiría, pero no entra)
    expect(m.a.money).toMatchObject({ consumed: 140, eventsConsumed: 2, avgConsumed: 70 });
    expect(m.c.money).toMatchObject({ consumed: 140, eventsConsumed: 2 });
    expect(m.d.money).toMatchObject({ consumed: 0, avgConsumed: null, eventsConsumed: 0 });
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

  it("quien puso plata para los demás sin consumir nada: no «consumió», pero su saldo cuenta", () => {
    const input = base();
    const { members: after } = buildAnalytics({
      ...input,
      members: [...input.members, member("z")],
      expenses: [...input.expenses, expense("xz", "g2", "z", 90, ["a", "b", "c"])],
    });
    const z = after.find((x) => x.id === "z");
    expect(z?.money).toMatchObject({ consumed: 0, eventsConsumed: 0, avgConsumed: null, balance: 90 });
  });

  it("MVP y goleador solo de eventos pasados", () => {
    expect(m.a.mvp).toBe(2);
    expect(m.b.goleador).toBe(1);
    expect(m.c.mvp).toBe(0); // el MVP del próximo no cuenta
  });

  it("detalle por evento: del más reciente al más viejo, solo donde participó", () => {
    expect(m.a.byEvent.map((r) => r.eventId)).toEqual(["e3", "e2", "e1"]);
    expect(m.a.byEvent[2]).toMatchObject({ eventId: "e1", juntada: "yes", futbol: "yes", consumed: 100 });
    expect(m.d.byEvent.map((r) => r.eventId)).toEqual(["e3"]);
  });
});

describe("buildAnalytics · tareas y racha", () => {
  const { members, events } = buildAnalytics(base());
  const m = Object.fromEntries(members.map((x) => [x.id, x]));

  it("cuenta en cuántos eventos pasados se anotó cada persona, una vez por evento y tipo", () => {
    // a: compra de insumos en e1 (dos veces, cuenta una) y e2; convocó e1 y e3
    expect(m.a.tasks.byType).toEqual({
      compra_insumos: 2,
      lavado_platos: 0,
      orden_sede: 0,
      reserva_cancha: 0,
      convocatoria: 2,
    });
    expect(m.a.tasks.total).toBe(4);
    // b: platos (e1), sede (e2) y convocó e2
    expect(m.b.tasks.byType).toMatchObject({ lavado_platos: 1, orden_sede: 1, convocatoria: 1 });
    expect(m.b.tasks.total).toBe(3);
  });

  it("lo asignado o convocado para el evento próximo no cuenta", () => {
    // c creó e4 (el próximo) y a se anotó en sus insumos: ninguno suma
    expect(m.c.tasks.byType.convocatoria).toBe(0);
    expect(m.c.tasks.total).toBe(1); // solo la reserva de cancha de e1
    expect(m.a.tasks.byType.compra_insumos).toBe(2);
  });

  it("quien no hizo nada tiene todo en cero", () => {
    expect(m.d.tasks).toEqual({
      total: 0,
      byType: { compra_insumos: 0, lavado_platos: 0, orden_sede: 0, reserva_cancha: 0, convocatoria: 0 },
    });
  });

  it("mejor racha y racha actual", () => {
    expect(m.a.bestStreak).toBe(3);
    // b: e1 sí, e2 tal vez (corta), e3 sí → la mejor es 1 y la actual también
    expect(m.b.bestStreak).toBe(1);
    expect(m.c.bestStreak).toBe(0);
    expect(m.d.bestStreak).toBe(1);
  });

  it("la mejor racha puede ser mayor que la actual", () => {
    const input = base();
    // f: sí, sí, no → la mejor fue 2 y la actual 0
    const result = buildAnalytics({
      ...input,
      members: [...input.members, member("f")],
      rsvps: [...input.rsvps, rsvp("e1", "f", "yes"), rsvp("e2", "f", "yes"), rsvp("e3", "f", "no")],
    });
    const f = result.members.find((x) => x.id === "f");
    expect(f?.bestStreak).toBe(2);
    expect(f?.streak).toBe(0);
  });

  it("invitados en total del evento (sin repetir a quien vino a la juntada y al fútbol)", () => {
    expect(events.find((e) => e.id === "e3")?.attendance.guestsTotal).toBe(2);
    const input = base();
    const both = buildAnalytics({
      ...input,
      guests: [guest("e1", "g-1", "a", "juntada"), guest("e1", "g-1", "a", "futbol"), guest("e1", "g-7", "a", "futbol")],
    });
    expect(both.events.find((e) => e.id === "e1")?.attendance.guestsTotal).toBe(2);
  });
});

describe("buildAnalytics · puestos de cada evento", () => {
  const { events } = buildAnalytics(base());
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  const pos = (id: string, key: string) => {
    const p = byId[id].positions?.[key as keyof NonNullable<(typeof byId)[string]["positions"]>];
    return p ? { rank: p.rank, of: p.of } : null;
  };

  it("rankea cada evento pasado entre los pasados (1 = el más alto)", () => {
    // confirmados 2, 1, 3
    expect([pos("e1", "confirmed"), pos("e2", "confirmed"), pos("e3", "confirmed")]).toEqual([
      { rank: 2, of: 3 },
      { rank: 3, of: 3 },
      { rank: 1, of: 3 },
    ]);
    // asistencia 2/3, 1/3, 3/4
    expect([pos("e1", "ratio"), pos("e2", "ratio"), pos("e3", "ratio")]).toEqual([
      { rank: 2, of: 3 },
      { rank: 3, of: 3 },
      { rank: 1, of: 3 },
    ]);
    // invitados 1, 0, 2
    expect([pos("e1", "guests"), pos("e2", "guests"), pos("e3", "guests")]).toEqual([
      { rank: 2, of: 3 },
      { rank: 3, of: 3 },
      { rank: 1, of: 3 },
    ]);
  });

  it("el evento sin gastos no rankea en gastos y no cuenta entre los que sí", () => {
    expect(pos("e3", "total")).toEqual({ rank: null, of: 2 });
    expect(pos("e1", "total")).toEqual({ rank: 1, of: 2 });
    expect(pos("e2", "total")).toEqual({ rank: 2, of: 2 });
    expect(pos("e1", "costPerPerson")).toEqual({ rank: 1, of: 2 });
    expect(pos("e1", "medianItem")).toEqual({ rank: 1, of: 2 });
    expect(pos("e1", "items")).toEqual({ rank: 1, of: 2 });
  });

  it("jugadores de fútbol: solo compiten los eventos con fútbol", () => {
    expect(pos("e1", "futbolConfirmed")).toEqual({ rank: 1, of: 2 });
    expect(pos("e2", "futbolConfirmed")).toEqual({ rank: 2, of: 2 });
    expect(pos("e3", "futbolConfirmed")).toEqual({ rank: null, of: 2 });
  });

  it("guarda los valores de todos para ubicar al evento entre los demás", () => {
    expect(byId.e1.positions?.confirmed.peers).toEqual([3, 2, 1]);
    expect(byId.e1.positions?.confirmed.value).toBe(2);
  });

  it("los invitados del puesto incluyen a los del fútbol (sin repetir al que vino a las dos)", () => {
    const input = base();
    const result = buildAnalytics({
      ...input,
      guests: [
        guest("e1", "g-1", "a", "futbol"),
        guest("e1", "g-2", "a", "futbol"),
        guest("e1", "g-1", "a", "juntada"),
        guest("e3", "g-3", "b", "futbol"),
      ],
    });
    const guests = (id: string) => result.events.find((e) => e.id === id)?.positions?.guests;
    expect(guests("e1")).toMatchObject({ value: 2, rank: 1, of: 3 });
    expect(guests("e3")).toMatchObject({ value: 1, rank: 2, of: 3 });
    expect(guests("e2")).toMatchObject({ value: 0, rank: 3, of: 3 });
  });

  it("el próximo evento no se rankea ni entra en los puestos de los demás", () => {
    expect(byId.e4.positions).toBeNull();
    expect(byId.e1.positions?.total.peers).toEqual([300, 120]);
    expect(byId.e3.positions?.confirmed.of).toBe(3);
  });
});

describe("buildAnalytics · bordes", () => {
  it("sin ningún evento: todo vacío y sin romper", () => {
    const result = buildAnalytics({ ...base(), events: [], rsvps: [], expenses: [], payments: [], guests: [], futbol: [], tasks: [] });
    expect(result.events).toEqual([]);
    expect(result.general.sample).toBe("none");
    expect(result.general.pastEvents).toBe(0);
    expect(result.general.attendance.confirmed.n).toBe(0);
    expect(result.general.attendance.confirmed.mean).toBeNull();
    expect(result.general.spending.total).toBe(0);
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
