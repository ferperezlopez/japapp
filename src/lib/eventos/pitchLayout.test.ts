import { describe, expect, it } from "vitest";
import {
  PITCH_POSITIONS,
  ROW_X_SPAN,
  buildPitchTeams,
  jerseySrc,
  rowXPositions,
  teamsImageFileName,
  teamsShareText,
  type PitchAssignment,
  type PitchCandidate,
  type PitchPosition,
} from "./pitchLayout";

const candidates: PitchCandidate[] = [
  "u:ari", "u:javi", "u:fer", "u:matic", "u:matil",
  "u:chacota", "u:dani", "u:gonza", "u:nico", "u:rober",
].map((id) => ({ id, name: id.slice(2).toUpperCase(), avatarUrl: null }));

const place = (team: 1 | 2, position: PitchPosition, ...ids: string[]): PitchAssignment[] =>
  ids.map((id) => ({ id: `u:${id}`, team, position }));

// 5 vs 5: arquero + 2 defensores + 2 delanteros por equipo.
const full: PitchAssignment[] = [
  ...place(1, "gk", "ari"),
  ...place(1, "def", "javi", "fer"),
  ...place(1, "fwd", "matic", "matil"),
  ...place(2, "gk", "chacota"),
  ...place(2, "def", "dani", "gonza"),
  ...place(2, "fwd", "nico", "rober"),
];

describe("buildPitchTeams", () => {
  it("ubica un 5 vs 5 en las filas y alturas medidas sobre la imagen de referencia", () => {
    const [t1, t2] = buildPitchTeams(candidates, full, null);

    expect([t1.team, t1.total, t2.team, t2.total]).toEqual([1, 5, 2, 5]);
    expect(t1.rows.map((r) => [r.position, r.y, r.players.map((p) => p.id)])).toEqual([
      ["gk", PITCH_POSITIONS[1].gkY, ["u:ari"]],
      ["def", PITCH_POSITIONS[1].defY, ["u:javi", "u:fer"]],
      ["fwd", PITCH_POSITIONS[1].fwdY, ["u:matic", "u:matil"]],
    ]);
    expect(t2.rows.map((r) => [r.position, r.y, r.players.map((p) => p.id)])).toEqual([
      ["gk", PITCH_POSITIONS[2].gkY, ["u:chacota"]],
      ["def", PITCH_POSITIONS[2].defY, ["u:dani", "u:gonza"]],
      ["fwd", PITCH_POSITIONS[2].fwdY, ["u:nico", "u:rober"]],
    ]);
  });

  it("reparte a lo ancho con los extremos medidos; uno solo va al centro", () => {
    const [t1] = buildPitchTeams(candidates, full, null);
    const xs = (position: PitchPosition) =>
      t1.rows.find((r) => r.position === position)!.players.map((p) => p.x);
    expect(xs("gk")).toEqual([50]);
    expect(xs("def")).toEqual(ROW_X_SPAN.def);
    expect(xs("fwd")).toEqual(ROW_X_SPAN.fwd);

    const [solo] = buildPitchTeams(candidates, place(1, "fwd", "matic"), null);
    expect(solo.rows[0].players[0].x).toBe(50);
  });

  it("con un solo defensor lo aleja del arco (defYSingle) para que no se pise con el arquero", () => {
    const [t1, t2] = buildPitchTeams(
      candidates,
      [...place(1, "gk", "ari"), ...place(1, "def", "javi"), ...place(2, "def", "dani")],
      null,
    );
    expect(t1.rows.find((r) => r.position === "def")!.y).toBe(PITCH_POSITIONS[1].defYSingle);
    expect(t2.rows.find((r) => r.position === "def")!.y).toBe(PITCH_POSITIONS[2].defYSingle);
  });

  it("con tres en una fila los interpola entre los mismos extremos", () => {
    const [t1] = buildPitchTeams(candidates, place(1, "def", "javi", "fer", "matic"), null);
    expect(t1.rows[0].players.map((p) => p.x)).toEqual(rowXPositions(3, ROW_X_SPAN.def));
    expect(t1.rows[0].players.map((p) => p.x)).toEqual([29, 49, 69]);
  });

  it("numera cada equipo por separado: arquero 1 y correlativo con defensores y delanteros", () => {
    const [t1, t2] = buildPitchTeams(candidates, full, null);
    const numbers = (team: typeof t1) => team.rows.flatMap((r) => r.players.map((p) => p.number));
    expect(numbers(t1)).toEqual([1, 2, 3, 4, 5]);
    expect(numbers(t2)).toEqual([1, 2, 3, 4, 5]);
  });

  it("el arquero y el resto de cada equipo llevan su camiseta", () => {
    const [t1, t2] = buildPitchTeams(candidates, full, null);
    const variants = (team: typeof t1) => team.rows.map((r) => r.players[0].variant);
    expect(variants(t1)).toEqual(["gk1", "team1", "team1"]);
    expect(variants(t2)).toEqual(["gk2", "team2", "team2"]);
  });

  it("marca MVP, goleador, o ambos, y nada si no hay resultado", () => {
    const badges = (stats: Parameters<typeof buildPitchTeams>[2]) =>
      Object.fromEntries(
        buildPitchTeams(candidates, full, stats).flatMap((t) =>
          t.rows.flatMap((r) => r.players.map((p) => [p.id, p.badge])),
        ),
      );

    expect(Object.values(badges(null)).every((b) => b === undefined)).toBe(true);
    expect(Object.values(badges({ mvpId: null, goleadorId: null })).every((b) => b === undefined)).toBe(true);

    const separate = badges({ mvpId: "u:javi", goleadorId: "u:nico" });
    expect(separate["u:javi"]).toBe("mvp");
    expect(separate["u:nico"]).toBe("goleador");
    expect(separate["u:ari"]).toBeUndefined();

    const both = badges({ mvpId: "u:matic", goleadorId: "u:matic" });
    expect(both["u:matic"]).toBe("both");
    expect(both["u:javi"]).toBeUndefined();
  });

  it("si por algún motivo hay dos arqueros en un equipo, quedan los dos en el centro (el armador no lo permite)", () => {
    const [t1] = buildPitchTeams(candidates, place(1, "gk", "ari", "javi"), null);
    expect(t1.rows[0].players.map((p) => p.x)).toEqual([50, 50]);
  });

  it("un equipo sin jugadores queda sin filas y con total 0", () => {
    const [t1, t2] = buildPitchTeams(candidates, place(1, "gk", "ari"), null);
    expect(t1.total).toBe(1);
    expect(t2).toEqual({ team: 2, total: 0, rows: [] });
  });

  it("ignora un id guardado que no está entre los candidatos y no lo cuenta", () => {
    const [t1] = buildPitchTeams(candidates, [...place(1, "gk", "ari"), ...place(1, "def", "fantasma")], null);
    expect(t1.total).toBe(1);
    expect(t1.rows.map((r) => r.position)).toEqual(["gk"]);
  });

  it("lleva el nombre y el id de invitado del candidato", () => {
    const guest: PitchCandidate = { id: "g:1", name: "Tomás Invitado", avatarUrl: null, guestId: "guest-1" };
    const [t1] = buildPitchTeams([guest], [{ id: "g:1", team: 1, position: "fwd" }], null);
    expect(t1.rows[0].players[0]).toMatchObject({ id: "g:1", name: "Tomás Invitado", guestId: "guest-1" });
  });
});

describe("jerseySrc", () => {
  it("elige la camiseta lisa o la que lleva trofeo, pelota o ambos", () => {
    expect(jerseySrc("team1")).toBe("/futbol/jersey-team1.webp");
    expect(jerseySrc("gk2")).toBe("/futbol/jersey-gk2.webp");
    expect(jerseySrc("team2", "mvp")).toBe("/futbol/jersey-team2-trophy.webp");
    expect(jerseySrc("gk1", "goleador")).toBe("/futbol/jersey-gk1-ball.webp");
    expect(jerseySrc("team1", "both")).toBe("/futbol/jersey-team1-both.webp");
  });
});

describe("teamsImageFileName", () => {
  it("usa el nombre de la juntada sin tildes ni símbolos", () => {
    expect(teamsImageFileName("JAPA muchaaaaachos")).toBe("equipos-japa-muchaaaaachos.jpg");
    expect(teamsImageFileName("JAPA + Cumple Tato 🎂")).toBe("equipos-japa-cumple-tato.jpg");
    expect(teamsImageFileName("Fútbol y asado: ¡Año Nuevo!")).toBe("equipos-futbol-y-asado-ano-nuevo.jpg");
  });

  it("si no queda nada usable, usa un nombre genérico", () => {
    expect(teamsImageFileName("")).toBe("equipos.jpg");
    expect(teamsImageFileName("🎂🎂")).toBe("equipos.jpg");
  });

  it("acorta los nombres largos sin dejar un guion al final", () => {
    const name = teamsImageFileName("a".repeat(39) + " b".repeat(20));
    expect(name).toMatch(/^equipos-[a-z0-9-]+\.jpg$/);
    expect(name.length).toBeLessThanOrEqual("equipos-".length + 40 + ".jpg".length);
    expect(name).not.toMatch(/-\.jpg$/);
  });
});

describe("teamsShareText", () => {
  it("lleva el nombre de la juntada y la fecha", () => {
    expect(teamsShareText("JAPA muchaaaaachos", "jueves, 30 de octubre")).toBe(
      "⚽ Equipos de JAPA muchaaaaachos · jueves, 30 de octubre",
    );
  });

  it("sin fecha, solo el nombre", () => {
    expect(teamsShareText("JAPA", "")).toBe("⚽ Equipos de JAPA");
  });
});
