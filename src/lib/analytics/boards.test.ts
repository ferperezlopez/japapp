import { describe, expect, it } from "vitest";
import { BOARD_KEYS, BOARD_LABELS, TASK_BOARD_KEYS, TASK_BOARD_LABELS, buildMemberBoards, buildPeopleMap, standingIn } from "./boards";
import { emptyTaskCounts } from "./tasks";
import type { AttendanceCount, MemberAnalytics } from "./types";

const att = (attended: number, absent: number): AttendanceCount => ({
  attended,
  absent,
  ratio: attended + absent === 0 ? null : attended / (attended + absent),
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

const ids = (rows: { userId: string }[]) => rows.map((r) => r.userId);
const ranks = (rows: { rank: number | null }[]) => rows.map((r) => r.rank);

describe("buildMemberBoards · asistencia", () => {
  const members = [
    member("a", { juntada: att(3, 0), eligibleEvents: { juntada: 3, futbol: 0 } }),
    member("b", { juntada: att(3, 0), eligibleEvents: { juntada: 3, futbol: 0 } }),
    member("c", { juntada: att(2, 1), eligibleEvents: { juntada: 3, futbol: 0 } }),
    member("d", { juntada: att(1, 0), eligibleEvents: { juntada: 1, futbol: 0 } }),
    member("e"),
  ];
  const board = buildMemberBoards(members).main.asistencia;

  it("ordena por asistencia y desempata por cantidad de eventos; los empates comparten puesto (1, 1, 3)", () => {
    expect(ids(board.rows).slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(ranks(board.rows).slice(0, 3)).toEqual([1, 1, 3]);
  });

  it("a igual porcentaje, quien fue a más eventos va primero y no empatan", () => {
    const result = buildMemberAttendanceBoard([
      member("x", { juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } }),
      member("y", { juntada: att(3, 0), eligibleEvents: { juntada: 3, futbol: 0 } }),
    ]);
    expect(ids(result.rows)).toEqual(["y", "x"]);
    expect(ranks(result.rows)).toEqual([1, 2]);
  });

  it("quien tiene menos de 2 eventos no se rankea: va al final como «nuevo», sin puesto", () => {
    expect(ids(board.rows).slice(3)).toEqual(["d", "e"]);
    expect(ranks(board.rows).slice(3)).toEqual([null, null]);
    expect(board.rows[3]).toMatchObject({ label: "1 de 1", detail: "nuevo" });
    expect(board.rows[4]).toMatchObject({ label: "—", detail: "nuevo", value: 0 });
  });

  it("con exactamente 2 eventos ya se rankea", () => {
    const result = buildMemberAttendanceBoard([member("f", { juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } })]);
    expect(result.rows[0].rank).toBe(1);
  });

  it("el rótulo dice «N de M» y el detalle el porcentaje; la barra va de 0 a 1", () => {
    expect(board.rows[0]).toMatchObject({ label: "3 de 3", detail: "100%", value: 1 });
    expect(board.rows[2]).toMatchObject({ label: "2 de 3", detail: "67%" });
    expect(board.max).toBe(1);
  });

  it("aclara por qué hay gente sin rankear solo si la hay", () => {
    expect(board.note).toContain("todavía no se rankea");
    const only = buildMemberAttendanceBoard([member("g", { juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } })]);
    expect(only.note).not.toContain("todavía no se rankea");
  });

  it("no depende del orden en que llegan los miembros", () => {
    const reversed = buildMemberBoards([...members].reverse()).main.asistencia;
    expect(reversed).toEqual(board);
  });

  it("a igual de todo, desempata por nombre (sin que los acentos molesten)", () => {
    const tied = buildMemberAttendanceBoard([
      member("z", { name: "Zoe", juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } }),
      member("a", { name: "Álvaro", juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } }),
    ]);
    expect(ids(tied.rows)).toEqual(["a", "z"]);
    expect(ranks(tied.rows)).toEqual([1, 1]);
  });
});

function buildMemberAttendanceBoard(members: MemberAnalytics[]) {
  return buildMemberBoards(members).main.asistencia;
}

describe("buildMemberBoards · racha, fútbol y premios", () => {
  it("racha: la mejor de cada uno, desempata por la actual; sin racha no aparece", () => {
    const { racha } = buildMemberBoards([
      member("a", { bestStreak: 3, streak: 3 }),
      member("b", { bestStreak: 3, streak: 1 }),
      member("c", { bestStreak: 1, streak: 0 }),
      member("d"),
    ]).main;
    expect(ids(racha.rows)).toEqual(["a", "b", "c"]);
    expect(ranks(racha.rows)).toEqual([1, 2, 3]);
    expect(racha.rows[0]).toMatchObject({ label: "3 seguidas", detail: "racha actual: 3", value: 3 });
    expect(racha.rows[1].detail).toBe("racha actual: 1");
    expect(racha.rows[2]).toMatchObject({ label: "1 seguida", detail: null });
    expect(racha.max).toBe(3);
  });

  it("fútbol: partidos jugados, desempata por asistencia", () => {
    const { futbol } = buildMemberBoards([
      member("a", { futbol: att(2, 0) }),
      member("b", { futbol: att(2, 2) }),
      member("c", { futbol: att(1, 0) }),
      member("d", { futbol: att(0, 3) }),
    ]).main;
    expect(ids(futbol.rows)).toEqual(["a", "b", "c"]);
    expect(futbol.rows[0]).toMatchObject({ label: "2 partidos", detail: "100% de asistencia" });
    expect(futbol.rows[2].label).toBe("1 partido");
  });

  it("MVP, goleador e invitados: solo quien tiene al menos uno, con el rótulo en singular o plural", () => {
    const { mvp, goleador, invitados } = buildMemberBoards([
      member("a", { mvp: 2, goleador: 1, guestsBrought: 3 }),
      member("b", { mvp: 1 }),
      member("c"),
    ]).main;
    expect(ids(mvp.rows)).toEqual(["a", "b"]);
    expect(mvp.rows.map((r) => r.label)).toEqual(["2 veces", "1 vez"]);
    expect(goleador.rows.map((r) => r.label)).toEqual(["1 vez"]);
    expect(invitados.rows.map((r) => r.label)).toEqual(["3 invitados"]);
    expect(invitados.max).toBe(3);
  });

  it("sin datos, el tablero queda vacío con su mensaje", () => {
    const { main, tasks } = buildMemberBoards([member("a")]);
    for (const key of ["racha", "futbol", "mvp", "goleador", "invitados"] as const) {
      expect(main[key].rows).toEqual([]);
      expect(main[key].empty).toBeTruthy();
      expect(main[key].max).toBe(1);
    }
    for (const key of TASK_BOARD_KEYS) expect(tasks[key].rows).toEqual([]);
  });

  it("sin miembros no rompe", () => {
    const { main } = buildMemberBoards([]);
    expect(main.asistencia.rows).toEqual([]);
  });

  it("cada tablero tiene su rótulo", () => {
    for (const key of BOARD_KEYS) expect(BOARD_LABELS[key]).toBeTruthy();
    for (const key of TASK_BOARD_KEYS) expect(TASK_BOARD_LABELS[key]).toBeTruthy();
  });
});

describe("buildMemberBoards · tareas", () => {
  const tasked = (byType: Partial<MemberAnalytics["tasks"]["byType"]>): MemberAnalytics["tasks"] => {
    const t = emptyTaskCounts();
    Object.assign(t.byType, byType);
    t.total = Object.values(t.byType).reduce((s, n) => s + n, 0);
    return t;
  };
  const { tasks } = buildMemberBoards([
    member("a", { tasks: tasked({ compra_insumos: 2, convocatoria: 2 }) }),
    member("b", { tasks: tasked({ lavado_platos: 1, orden_sede: 1 }) }),
    member("c", { tasks: tasked({ compra_insumos: 1 }) }),
  ]);

  it("«todas» suma todos los tipos y detalla cuáles", () => {
    expect(ids(tasks.todas.rows)).toEqual(["a", "b", "c"]);
    expect(tasks.todas.rows[0]).toMatchObject({ value: 4, label: "4 veces", detail: "Insumos ×2 · Convocatoria ×2" });
    expect(tasks.todas.rows[1].detail).toBe("Platos ×1 · Sede ×1");
    expect(tasks.todas.title).toBe("Tareas");
  });

  it("cada tipo rankea solo a quien lo hizo", () => {
    expect(ids(tasks.compra_insumos.rows)).toEqual(["a", "c"]);
    expect(tasks.compra_insumos.rows.map((r) => r.label)).toEqual(["2 veces", "1 vez"]);
    expect(tasks.compra_insumos.title).toBe("Compra de insumos");
    expect(ids(tasks.convocatoria.rows)).toEqual(["a"]);
    expect(tasks.convocatoria.note).toContain("creó el evento");
    expect(tasks.reserva_cancha.rows).toEqual([]);
  });

  it("los empates comparten puesto", () => {
    const tied = buildMemberBoards([
      member("a", { tasks: tasked({ orden_sede: 1 }) }),
      member("b", { tasks: tasked({ orden_sede: 1 }) }),
    ]).tasks.orden_sede;
    expect(ranks(tied.rows)).toEqual([1, 1]);
  });

  it("el detalle de «todas» solo existe ahí", () => {
    expect(tasks.compra_insumos.rows[0].detail).toBeNull();
  });
});

describe("standingIn", () => {
  const members = [
    member("a", { mvp: 2 }),
    member("b", { mvp: 1 }),
    member("c", { mvp: 1 }),
    member("d", { mvp: 0 }),
    member("e", { juntada: att(1, 0), eligibleEvents: { juntada: 1, futbol: 0 } }),
    member("f", { juntada: att(2, 0), eligibleEvents: { juntada: 2, futbol: 0 } }),
  ];
  const { main } = buildMemberBoards(members);

  it("dice el puesto y entre cuántas personas, con su fila", () => {
    expect(standingIn(main.mvp, "a")).toEqual({ rank: 1, of: 3, row: main.mvp.rows[0] });
  });

  it("los empates comparten puesto", () => {
    expect(standingIn(main.mvp, "b")?.rank).toBe(2);
    expect(standingIn(main.mvp, "c")?.rank).toBe(2);
  });

  it("quien no figura (sin nada en la categoría) no tiene puesto", () => {
    expect(standingIn(main.mvp, "d")).toBeNull();
    expect(standingIn(main.mvp, "no-existe")).toBeNull();
  });

  it("quien todavía no tiene historia suficiente no tiene puesto ni cuenta en el total", () => {
    expect(standingIn(main.asistencia, "e")).toBeNull();
    // solo f se rankea: 1 de 1; e (nuevo) y el resto sin historia no suman
    expect(standingIn(main.asistencia, "f")).toMatchObject({ rank: 1, of: 1 });
  });
});

describe("buildPeopleMap", () => {
  it("nombre y foto de cada persona por id", () => {
    expect(
      buildPeopleMap([member("a", { name: "Ana", avatarUrl: "https://x/a.png" }), member("b")]),
    ).toEqual({
      a: { name: "Ana", avatarUrl: "https://x/a.png" },
      b: { name: "B", avatarUrl: null },
    });
  });

  it("sin miembros, vacío", () => {
    expect(buildPeopleMap([])).toEqual({});
  });
});
