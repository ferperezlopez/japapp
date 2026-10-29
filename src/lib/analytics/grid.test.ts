import { describe, expect, it } from "vitest";
import { buildAttendanceGrid, buildDistribution } from "./grid";
import { emptyTaskCounts } from "./tasks";
import type { AttendanceCount, MemberAnalytics, MemberEventRow, MemberEventStatus } from "./types";

const att = (attended: number, absent: number): AttendanceCount => ({
  attended,
  absent,
  ratio: attended + absent === 0 ? null : attended / (attended + absent),
});

const row = (eventId: string, juntada: MemberEventStatus): MemberEventRow => ({
  eventId,
  name: eventId,
  eventDate: "2026-10-01T00:00:00Z",
  juntada,
  futbol: null,
  consumed: 0,
});

function member(id: string, over: Partial<MemberAnalytics> = {}): MemberAnalytics {
  return {
    id,
    name: id.toUpperCase(),
    avatarUrl: null,
    joinedAt: "2026-01-01T00:00:00Z",
    juntada: att(0, 0),
    futbol: att(0, 0),
    eligibleEvents: { juntada: 0, futbol: 0 },
    streak: 0,
    bestStreak: 0,
    guestsBrought: 0,
    tasks: emptyTaskCounts(),
    money: { consumed: 0, eventsConsumed: 0, avgConsumed: null, balance: 0 },
    mvp: 0,
    goleador: 0,
    byEvent: [],
    ...over,
  };
}

const events = [
  { id: "e3", name: "Tres", eventDate: "2026-10-16T19:20:00Z" },
  { id: "e1", name: "Uno", eventDate: "2026-09-18T19:30:00Z" },
  { id: "e2", name: "Dos", eventDate: "2026-10-02T20:00:00Z" },
];

describe("buildAttendanceGrid", () => {
  const members = [
    member("c", { juntada: att(0, 3), byEvent: [row("e3", "none"), row("e2", "no"), row("e1", "none")] }),
    member("a", { juntada: att(3, 0), byEvent: [row("e3", "yes"), row("e2", "yes"), row("e1", "yes")] }),
    member("b", { juntada: att(1, 1), byEvent: [row("e3", "maybe"), row("e2", "yes")] }),
    member("n"),
  ];
  const grid = buildAttendanceGrid(members, events);

  it("los eventos van del más viejo al más reciente, venga como venga la lista", () => {
    expect(grid.events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("una celda por evento con la respuesta de cada persona; «na» si todavía no era miembro", () => {
    const byId = Object.fromEntries(grid.rows.map((r) => [r.userId, r.cells]));
    expect(byId.a).toEqual(["yes", "yes", "yes"]);
    expect(byId.b).toEqual(["na", "yes", "maybe"]);
    expect(byId.c).toEqual(["none", "no", "none"]);
    expect(byId.n).toEqual(["na", "na", "na"]);
  });

  it("ordena por asistencia (más fiel arriba) y deja al sin datos al final", () => {
    expect(grid.rows.map((r) => r.userId)).toEqual(["a", "b", "c", "n"]);
  });

  it("los totales de cada fila son los de siempre", () => {
    expect(grid.rows[0]).toMatchObject({ attended: 3, ratio: 1 });
    expect(grid.rows[3]).toMatchObject({ attended: 0, ratio: null });
  });

  it("muestra solo los últimos N eventos y avisa cuántos quedaron afuera", () => {
    const small = buildAttendanceGrid(members, events, 2);
    expect(small.events.map((e) => e.id)).toEqual(["e2", "e3"]);
    expect(small.hidden).toBe(1);
    const byId = Object.fromEntries(small.rows.map((r) => [r.userId, r.cells]));
    expect(byId.a).toEqual(["yes", "yes"]);
    expect(byId.b).toEqual(["yes", "maybe"]);
    expect(grid.hidden).toBe(0);
  });

  it("a igual porcentaje, quien fue a más eventos va arriba; después, por nombre", () => {
    const tie = buildAttendanceGrid(
      [
        member("y", { juntada: att(2, 0) }),
        member("x", { juntada: att(3, 0) }),
        member("w", { juntada: att(2, 0) }),
      ],
      events,
    );
    expect(tie.rows.map((r) => r.userId)).toEqual(["x", "w", "y"]);
  });

  it("sin eventos o sin miembros no rompe", () => {
    expect(buildAttendanceGrid(members, []).events).toEqual([]);
    expect(buildAttendanceGrid([], events).rows).toEqual([]);
  });
});

describe("buildDistribution", () => {
  const withAttended = (n: number, eligible = 3) =>
    member(`m${Math.random()}`, { juntada: att(n, eligible - n), eligibleEvents: { juntada: eligible, futbol: 0 } });

  it("hasta 10 eventos: cuánta gente fue a 0, 1, 2… eventos", () => {
    const { buckets, considered } = buildDistribution(
      [withAttended(0), withAttended(0), withAttended(2), withAttended(3), withAttended(3), withAttended(3)],
      3,
    );
    expect(buckets).toEqual([
      { label: "0", members: 2 },
      { label: "1", members: 0 },
      { label: "2", members: 1 },
      { label: "3", members: 3 },
    ]);
    expect(considered).toBe(6);
  });

  it("no cuenta a quien todavía no tuvo ningún evento desde que se unió", () => {
    const { buckets, considered } = buildDistribution([withAttended(1), member("nuevo")], 3);
    expect(considered).toBe(1);
    expect(buckets.reduce((s, b) => s + b.members, 0)).toBe(1);
  });

  it("sin eventos pasados hay un solo tramo, vacío", () => {
    expect(buildDistribution([member("a")], 0)).toEqual({ buckets: [{ label: "0", members: 0 }], considered: 0 });
  });

  it("con más de 10 eventos agrupa por tramos de asistencia", () => {
    const at = (attended: number, absent: number) =>
      member(`x${attended}-${absent}`, { juntada: att(attended, absent), eligibleEvents: { juntada: attended + absent, futbol: 0 } });
    const { buckets } = buildDistribution(
      [at(0, 12), at(3, 9), at(3, 9), at(6, 6), at(9, 3), at(11, 1), at(12, 0)],
      12,
    );
    expect(buckets).toEqual([
      { label: "0%", members: 1 },
      { label: "1–25%", members: 2 },
      { label: "26–50%", members: 1 },
      { label: "51–75%", members: 1 },
      { label: "76–99%", members: 1 },
      { label: "100%", members: 1 },
    ]);
  });

  it("con exactamente 10 eventos todavía hay una barra por cantidad (11); con 11 pasa a tramos (6)", () => {
    expect(buildDistribution([withAttended(4, 10)], 10).buckets).toHaveLength(11);
    expect(buildDistribution([withAttended(4, 11)], 11).buckets).toHaveLength(6);
  });

  it("los bordes de cada tramo: 25 %, 50 %, 75 %", () => {
    const at = (attended: number, total: number) =>
      member(`b${attended}-${total}`, { juntada: att(attended, total - attended), eligibleEvents: { juntada: total, futbol: 0 } });
    const { buckets } = buildDistribution([at(3, 12), at(6, 12), at(9, 12)], 12);
    expect(buckets.map((b) => b.members)).toEqual([0, 1, 1, 1, 0, 0]);
  });
});
