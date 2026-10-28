import { describe, expect, it } from "vitest";
import { buildEventFutbol, countAwards } from "./football";
import { futbol } from "./fixtures";

describe("buildEventFutbol", () => {
  it("devuelve el resultado, el MVP y el goleador del evento", () => {
    const rows = [futbol("e1", { resultado: "4-9", mvpUserId: "a", goleadorUserId: "b" })];
    expect(buildEventFutbol(rows, "e1")).toEqual({ resultado: "4-9", mvpUserId: "a", goleadorUserId: "b" });
  });

  it("null si el evento no tiene fila", () => {
    expect(buildEventFutbol([futbol("e2", { mvpUserId: "a" })], "e1")).toBeNull();
    expect(buildEventFutbol([], "e1")).toBeNull();
  });

  it("una fila vacía (o con un resultado en blanco) es como no tener datos", () => {
    expect(buildEventFutbol([futbol("e1")], "e1")).toBeNull();
    expect(buildEventFutbol([futbol("e1", { resultado: "   " })], "e1")).toBeNull();
  });

  it("alcanza con tener una sola cosa cargada", () => {
    expect(buildEventFutbol([futbol("e1", { resultado: " 10-6 " })], "e1")).toEqual({
      resultado: "10-6",
      mvpUserId: null,
      goleadorUserId: null,
    });
    expect(buildEventFutbol([futbol("e1", { mvpUserId: "a" })], "e1")?.mvpUserId).toBe("a");
  });
});

describe("countAwards", () => {
  const all = new Set(["e1", "e2", "e3"]);

  it("cuenta MVP y goleador por persona", () => {
    const awards = countAwards(
      [
        futbol("e1", { mvpUserId: "a", goleadorUserId: "b" }),
        futbol("e2", { mvpUserId: "a", goleadorUserId: "a" }),
        futbol("e3", { mvpUserId: "c" }),
      ],
      all,
    );
    expect(awards.get("a")).toEqual({ mvp: 2, goleador: 1 });
    expect(awards.get("b")).toEqual({ mvp: 0, goleador: 1 });
    expect(awards.get("c")).toEqual({ mvp: 1, goleador: 0 });
    expect(awards.get("d")).toBeUndefined();
  });

  it("solo cuenta los eventos que se le piden", () => {
    const awards = countAwards(
      [futbol("e1", { mvpUserId: "a" }), futbol("futuro", { mvpUserId: "a" })],
      new Set(["e1"]),
    );
    expect(awards.get("a")).toEqual({ mvp: 1, goleador: 0 });
  });

  it("ignora los premios sin persona (por ejemplo, a un invitado)", () => {
    expect(countAwards([futbol("e1")], all).size).toBe(0);
  });
});
