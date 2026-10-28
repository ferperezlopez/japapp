import { describe, expect, it } from "vitest";
import { buildAnalytics } from "./build";
import { NOW, event, expense, futbol, member, rsvp } from "./fixtures";
import {
  defaultDirection,
  nextSort,
  sortMemberRows,
  toMemberRow,
  type MemberTableRow,
} from "./memberTable";

const row = (id: string, extra: Partial<MemberTableRow> = {}): MemberTableRow => ({
  id,
  name: id,
  avatarUrl: null,
  ratio: 0.5,
  attended: 1,
  counted: 2,
  paid: 0,
  consumed: 0,
  net: 0,
  mvp: 0,
  ...extra,
});

const ids = (rows: MemberTableRow[]) => rows.map((r) => r.id);

describe("sortMemberRows", () => {
  it("ordena por una columna numérica en los dos sentidos", () => {
    const rows = [row("a", { paid: 10 }), row("b", { paid: 30 }), row("c", { paid: 20 })];
    expect(ids(sortMemberRows(rows, { key: "paid", dir: "desc" }))).toEqual(["b", "c", "a"]);
    expect(ids(sortMemberRows(rows, { key: "paid", dir: "asc" }))).toEqual(["a", "c", "b"]);
  });

  it("el neto negativo va por debajo del positivo", () => {
    const rows = [row("a", { net: -50 }), row("b", { net: 80 }), row("c", { net: 0 })];
    expect(ids(sortMemberRows(rows, { key: "net", dir: "desc" }))).toEqual(["b", "c", "a"]);
  });

  it("quien no tiene asistencia (null) va siempre al final, en cualquier sentido", () => {
    const rows = [row("a", { ratio: null }), row("b", { ratio: 0.2 }), row("c", { ratio: 0.9 })];
    expect(ids(sortMemberRows(rows, { key: "ratio", dir: "desc" }))).toEqual(["c", "b", "a"]);
    expect(ids(sortMemberRows(rows, { key: "ratio", dir: "asc" }))).toEqual(["b", "c", "a"]);
  });

  it("los empates se desempatan por nombre, así el orden es estable", () => {
    const rows = [row("z", { mvp: 1, name: "Zoe" }), row("a", { mvp: 1, name: "Ana" }), row("m", { mvp: 2, name: "Mara" })];
    expect(ids(sortMemberRows(rows, { key: "mvp", dir: "desc" }))).toEqual(["m", "a", "z"]);
    expect(ids(sortMemberRows(rows, { key: "mvp", dir: "asc" }))).toEqual(["a", "z", "m"]);
  });

  it("varios sin dato entre sí también se ordenan por nombre", () => {
    const rows = [row("b", { ratio: null, name: "Beto" }), row("a", { ratio: null, name: "Ana" })];
    expect(ids(sortMemberRows(rows, { key: "ratio", dir: "desc" }))).toEqual(["a", "b"]);
  });

  it("por nombre: de la A a la Z, sin que los acentos lo desordenen", () => {
    const rows = [row("1", { name: "Beto" }), row("2", { name: "Álvaro" }), row("3", { name: "ana" })];
    expect(ids(sortMemberRows(rows, { key: "name", dir: "asc" }))).toEqual(["2", "3", "1"]);
    expect(ids(sortMemberRows(rows, { key: "name", dir: "desc" }))).toEqual(["1", "3", "2"]);
  });

  it("da siempre el mismo orden, entre sin dato y empates, venga como venga la lista", () => {
    const rows = [
      row("1", { name: "Ana", ratio: null }),
      row("2", { name: "Ana", ratio: null }),
      row("3", { name: "Beto", ratio: 0.5 }),
      row("4", { name: "Zoe", ratio: 0.5 }),
    ];
    const permutations = (list: MemberTableRow[]): MemberTableRow[][] =>
      list.length <= 1
        ? [list]
        : list.flatMap((item, i) =>
            permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]),
          );
    // Con valor primero (los dos de 50 %, por nombre) y sin dato al final, en los dos sentidos.
    for (const dir of ["asc", "desc"] as const) {
      for (const input of permutations(rows)) {
        expect(ids(sortMemberRows(input, { key: "ratio", dir })), `${dir} ${ids(input)}`).toEqual(["3", "4", "1", "2"]);
      }
    }
    // mismo nombre y mismo valor: desempata el id
    const same = [row("b", { name: "Ana", paid: 5 }), row("a", { name: "Ana", paid: 5 })];
    expect(ids(sortMemberRows(same, { key: "paid", dir: "desc" }))).toEqual(["a", "b"]);
    expect(ids(sortMemberRows([...same].reverse(), { key: "name", dir: "asc" }))).toEqual(["a", "b"]);
  });

  it("no modifica la lista original", () => {
    const rows = [row("a", { paid: 1 }), row("b", { paid: 2 })];
    sortMemberRows(rows, { key: "paid", dir: "desc" });
    expect(ids(rows)).toEqual(["a", "b"]);
  });
});

describe("nextSort y defaultDirection", () => {
  it("los nombres empiezan de la A a la Z y el resto de más a menos", () => {
    expect(defaultDirection("name")).toBe("asc");
    for (const key of ["ratio", "paid", "consumed", "net", "mvp"] as const) {
      expect(defaultDirection(key)).toBe("desc");
    }
  });

  it("tocar la columna activa invierte el sentido", () => {
    expect(nextSort({ key: "ratio", dir: "desc" }, "ratio")).toEqual({ key: "ratio", dir: "asc" });
    expect(nextSort({ key: "ratio", dir: "asc" }, "ratio")).toEqual({ key: "ratio", dir: "desc" });
  });

  it("tocar otra columna arranca por el sentido que le corresponde", () => {
    expect(nextSort({ key: "ratio", dir: "asc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "paid")).toEqual({ key: "paid", dir: "desc" });
  });
});

describe("toMemberRow · la fracción cierra con el porcentaje", () => {
  it("un «tal vez» no cuenta: 1 de 1 (100 %), aunque haya 2 eventos elegibles", () => {
    const result = buildAnalytics({
      now: NOW,
      members: [member("a")],
      events: [event("e1", "2026-10-02T20:00:00Z"), event("e2", "2026-10-16T19:20:00Z")],
      rsvps: [rsvp("e1", "a", "yes"), rsvp("e2", "a", "maybe")],
      guests: [],
      expenses: [],
      payments: [],
      futbol: [],
    });
    const a = toMemberRow(result.members[0]);
    expect(result.members[0].eligibleEvents.juntada).toBe(2);
    expect(a).toMatchObject({ ratio: 1, attended: 1, counted: 1 });
  });
});

describe("toMemberRow", () => {
  it("toma de MemberAnalytics lo que muestra la tabla", () => {
    const result = buildAnalytics({
      now: NOW,
      members: [member("a"), member("b")],
      events: [event("e1", "2026-10-02T20:00:00Z", { groupId: "g1" })],
      rsvps: [rsvp("e1", "a", "yes")],
      guests: [],
      expenses: [expense("x1", "g1", "a", 100, ["a", "b"])],
      payments: [],
      futbol: [futbol("e1", { mvpUserId: "a" })],
    });
    const a = result.members.find((m) => m.id === "a")!;
    expect(toMemberRow(a)).toEqual({
      id: "a",
      name: "A",
      avatarUrl: null,
      ratio: 1,
      attended: 1,
      counted: 1,
      paid: 100,
      consumed: 50,
      net: 50,
      mvp: 1,
    });
  });
});
