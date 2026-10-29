import { describe, expect, it } from "vitest";
import { buildAnalytics } from "./build";
import { buildMemberBoards, buildPeopleMap, type Board } from "./boards";
import { NOW, baseInput, event, futbol, member, rsvp } from "./fixtures";
import {
  RANKING_LIMIT,
  buildEventInfographic,
  buildGeneralInfographic,
  buildMemberInfographic,
  buildRankingInfographic,
  infographicFileName,
  infographicShareText,
  type InfographicBlock,
  type InfographicSpec,
} from "./infographic";
import { formatDayLong } from "./format";

const analytics = buildAnalytics(baseInput());

function block<T extends InfographicBlock["type"]>(
  spec: InfographicSpec | null,
  type: T,
  title?: string,
): Extract<InfographicBlock, { type: T }> {
  const found = spec?.blocks.find(
    (b) => b.type === type && (title === undefined || ("title" in b && b.title === title)),
  );
  if (!found) throw new Error(`falta el bloque ${type}${title ? ` «${title}»` : ""}`);
  return found as Extract<InfographicBlock, { type: T }>;
}

const hasBlock = (spec: InfographicSpec | null, type: string, title?: string) =>
  spec?.blocks.some((b) => b.type === type && (title === undefined || ("title" in b && b.title === title))) ?? false;

describe("buildGeneralInfographic", () => {
  const spec = buildGeneralInfographic(analytics);

  it("sin eventos pasados no hay nada que compartir", () => {
    const empty = buildAnalytics({ ...baseInput(), events: [], rsvps: [], expenses: [], futbol: [], tasks: [] });
    expect(buildGeneralInfographic(empty)).toBeNull();
  });

  it("encabezado, ruta de la app y archivo", () => {
    expect(spec).toMatchObject({
      kicker: "Analytics",
      title: "JAPA en números",
      subtitle: "Sobre 3 eventos pasados",
      path: "/analytics",
      fileName: "japa-en-numeros.jpg",
      avatarName: null,
    });
    expect(spec?.shareLines).toEqual(["📊 JAPA en números · sobre 3 eventos pasados"]);
  });

  it("los cuatro indicadores de la pantalla, con sus variaciones coloreadas por mejor/peor", () => {
    const { items } = block(spec, "stats");
    expect(items.map((i) => [i.label, i.value, i.note])).toEqual([
      ["Confirmados", "2", "por evento: promedio · mediana 2"],
      ["Asistencia", "58%", "de los miembros, en promedio"],
      ["Gasto total", "$420", "promedio por evento $210"],
      ["Costo por persona", "$70", "promedio · mediana $70"],
    ]);
    // Más confirmados y más asistencia: bueno. Menos gasto y menos costo: también.
    expect(items[0].delta).toEqual({ text: "+2 (+200%)", tone: "good", direction: "up" });
    expect(items[1].delta).toEqual({ text: "+42 pts", tone: "good", direction: "up" });
    expect(items[2].delta).toEqual({ text: "-60% (-$180)", tone: "good", direction: "down" });
    expect(items[3].delta).toEqual({ text: "-60% (-$60)", tone: "good", direction: "down" });
  });

  it("la leyenda de las variaciones va una vez", () => {
    const notes = spec?.blocks.filter((b) => b.type === "note") ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ text: expect.stringContaining("último evento contra el anterior") });
  });

  it("con un solo evento pasado no hay variaciones ni leyenda", () => {
    const one = buildGeneralInfographic(
      buildAnalytics({ ...baseInput(), events: baseInput().events.filter((e) => e.id === "e1" || e.id === "e4") }),
    );
    expect(block(one, "stats").items.every((i) => i.delta === null)).toBe(true);
    expect(hasBlock(one, "note")).toBe(false);
    expect(one?.subtitle).toBe("Sobre 1 evento pasado");
  });

  it("gráficos de confirmados y costo por persona con su promedio, solo eventos pasados", () => {
    const confirmed = block(spec, "bars", "Confirmados por evento");
    expect(confirmed.bars.map((b) => [b.label, b.value, b.valueLabel])).toEqual([
      ["18/9", 2, "2"],
      ["2/10", 1, "1"],
      ["16/10", 3, "3"],
    ]);
    expect(confirmed.reference).toEqual({ value: 2, label: "promedio 2" });
    expect(confirmed.tone).toBe("eventos");

    const cost = block(spec, "bars", "Costo por persona");
    expect(cost.bars.map((b) => b.valueLabel)).toEqual(["$100", "$40", "—"]);
    expect(cost.bars[2].value).toBeNull();
    expect(cost.reference).toEqual({ value: 70, label: "promedio $70" });
    expect(cost.tone).toBe("gastos");
  });

  it("con dos eventos pasados ya hay variaciones y leyenda (hay con qué comparar)", () => {
    const two = buildGeneralInfographic(
      buildAnalytics({ ...baseInput(), events: baseInput().events.filter((e) => e.id !== "e3") }),
    );
    expect(block(two, "stats").items.every((i) => i.delta !== null)).toBe(true);
    expect(hasBlock(two, "note")).toBe(true);
    expect(two?.subtitle).toBe("Sobre 2 eventos pasados");
  });

  it("con más de 8 eventos pasados, los gráficos muestran los últimos 8", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event(`x${i}`, `2026-0${i < 9 ? i + 1 : 9}-${i < 9 ? "10" : "20"}T20:00:00Z`),
    );
    const rsvps = events.map((e) => rsvp(e.id, "a", "yes"));
    const many = buildGeneralInfographic(
      buildAnalytics({ ...baseInput(), members: [member("a")], events, rsvps, guests: [], expenses: [], payments: [], futbol: [], tasks: [] }),
    );
    const bars = block(many, "bars", "Confirmados por evento").bars;
    expect(bars).toHaveLength(8);
    // Los dos más viejos (enero y febrero) quedaron afuera.
    expect(bars[0].label).toBe("10/3");
    expect(bars.at(-1)?.label).toBe("20/9");
  });

  it("el MVP del grupo muestra solo los 3 primeros", () => {
    const events = ["m1", "m2", "m3", "m4"].map((id, i) => event(id, `2026-09-0${i + 1}T20:00:00Z`, { hasFutbol: true }));
    const input = {
      ...baseInput(),
      members: ["a", "b", "c", "d"].map((id) => member(id)),
      events,
      rsvps: [],
      guests: [],
      expenses: [],
      payments: [],
      tasks: [],
      futbol: events.map((e, i) => futbol(e.id, { mvpUserId: ["a", "b", "c", "d"][i] })),
    };
    const mvp = block(buildGeneralInfographic(buildAnalytics(input)), "ranking", "MVP del grupo");
    expect(mvp.rows).toHaveLength(3);
    expect(mvp.more).toBe(1);
  });

  it("con pocas muestras no se dibujan los gráficos", () => {
    const two = buildGeneralInfographic(
      buildAnalytics({ ...baseInput(), events: baseInput().events.filter((e) => e.id !== "e3") }),
    );
    expect(hasBlock(two, "bars")).toBe(false);
    expect(hasBlock(two, "stats")).toBe(true);
  });

  it("rankings: los más fieles (sin los nuevos), MVP y tareas, con nombres", () => {
    const faithful = block(spec, "ranking", "Los más fieles");
    expect(faithful.rows.map((r) => [r.rank, r.name, r.valueLabel])).toEqual([
      [1, "A", "3 de 3"],
      [2, "B", "2 de 2"],
      [3, "C", "0 de 3"],
    ]);
    expect(faithful.more).toBe(0);
    expect(faithful.note).toBeNull();

    expect(block(spec, "ranking", "MVP del grupo").rows).toEqual([
      { rank: 1, name: "A", value: 2, valueLabel: "2 veces", detail: null },
    ]);

    const tasks = block(spec, "ranking", "Tareas");
    expect(tasks.rows.map((r) => [r.rank, r.name, r.valueLabel])).toEqual([
      [1, "A", "4 veces"],
      [2, "B", "3 veces"],
      [3, "C", "1 vez"],
    ]);
    expect(tasks.rows[0].detail).toBe("Insumos ×2 · Convocatoria ×2");
  });

  it("sin MVP cargado no hay bloque de MVP", () => {
    const noMvp = buildGeneralInfographic(buildAnalytics({ ...baseInput(), futbol: [] }));
    expect(hasBlock(noMvp, "ranking", "MVP del grupo")).toBe(false);
    expect(hasBlock(noMvp, "ranking", "Los más fieles")).toBe(true);
  });

  it("los rankings muestran solo los primeros y avisan cuántos más hay", () => {
    const members = Array.from({ length: 9 }, (_, i) => member(`m${i}`));
    const events = [event("x1", "2026-10-01T20:00:00Z"), event("x2", "2026-10-08T20:00:00Z")];
    const rsvps = members.flatMap((m) => events.map((e) => rsvp(e.id, m.id, "yes")));
    const big = buildGeneralInfographic(
      buildAnalytics({ ...baseInput(), members, events, rsvps, guests: [], expenses: [], payments: [], futbol: [], tasks: [] }),
    );
    const faithful = block(big, "ranking", "Los más fieles");
    expect(faithful.rows).toHaveLength(5);
    expect(faithful.more).toBe(4);
  });
});

describe("buildEventInfographic", () => {
  it("un evento que no existe no tiene infografía", () => {
    expect(buildEventInfographic(analytics, "no-existe")).toBeNull();
  });

  describe("evento pasado con fútbol y gastos (e1)", () => {
    const spec = buildEventInfographic(analytics, "e1");

    it("encabezado: nombre, fecha en hora de Argentina, fútbol y ruta", () => {
      expect(spec).toMatchObject({
        kicker: "Evento",
        title: "Evento e1",
        subtitle: formatDayLong("2026-09-18T19:30:00Z"),
        chips: ["Con fútbol"],
        path: "/analytics/eventos/e1",
        fileName: "evento-evento-e1.jpg",
      });
      expect(spec?.shareLines).toEqual([`📊 Evento e1 · ${formatDayLong("2026-09-18T19:30:00Z")}`]);
    });

    it("lo que pasó: confirmados, gasto, costo por persona y mediana por ítem", () => {
      expect(block(spec, "stats").items.map((i) => [i.label, i.value, i.note])).toEqual([
        ["Confirmados", "2 de 3", "67% de asistencia · + 1 invitado"],
        ["Gasto total", "$300", "2 ítems"],
        ["Costo por persona", "$100", "entre 3 personas"],
        ["Gasto por ítem", "$150", "mediana · máx. $200"],
      ]);
    });

    it("posiciones entre los eventos pasados, solo donde hay con quién comparar", () => {
      const facts = block(spec, "facts", "Posiciones entre los eventos pasados");
      const byLabel = Object.fromEntries(facts.rows.map((r) => [r.label, r]));
      // e1 confirmó 2 de los 3 eventos pasados (3, 2, 1): segundo.
      expect(byLabel["Confirmados"]).toEqual({ label: "Confirmados", value: "2", tag: "#2 de 3" });
      // Gasto: solo e1 y e2 tienen gastos, y e1 gastó más.
      expect(byLabel["Gasto total"]).toEqual({ label: "Gasto total", value: "$300", tag: "#1 de 2" });
      expect(byLabel["Costo por persona"].tag).toBe("#1 de 2");
      expect(byLabel["Invitados"].tag).toBe("#2 de 3");
      expect(byLabel["Jugadores de fútbol"].tag).toBe("#1 de 2");
      expect(facts.note).toBe("#1 es el valor más alto.");
    });

    it("comparación con la mediana de los demás: barras, referencia y variación coloreada", () => {
      const confirmed = block(spec, "bars", "Confirmados");
      expect(confirmed.bars.map((b) => [b.label, b.value, b.highlight])).toEqual([
        ["18/9", 2, true],
        ["2/10", 1, false],
        ["16/10", 3, false],
      ]);
      expect(confirmed.reference).toEqual({ value: 2, label: "mediana 2" });
      expect(confirmed.delta).toEqual({ text: "igual", tone: "equal", direction: "flat" });
      expect(confirmed.note).toBe("Mediana de los otros 2 eventos. Pocas muestras.");

      const cost = block(spec, "bars", "Costo por persona");
      // Costó $100 contra una mediana de $40: más costo es peor.
      expect(cost.delta).toEqual({ text: "+150% (+$60)", tone: "bad", direction: "up" });
      expect(cost.note).toBe("Se compara con 1 solo evento. Pocas muestras.");
    });

    it("fútbol: jugadores, resultado, MVP y goleador con nombre", () => {
      expect(block(spec, "facts", "Fútbol").rows).toEqual([
        { label: "Jugadores", value: "1", tag: "33%" },
        { label: "Resultado", value: "4-9", tag: null },
        { label: "MVP", value: "A", tag: null },
        { label: "Goleador", value: "B", tag: null },
      ]);
    });
  });

  it("un evento sin invitados no los menciona (e2)", () => {
    const spec = buildEventInfographic(analytics, "e2");
    expect(block(spec, "stats").items[0]).toMatchObject({ value: "1 de 3", note: "33% de asistencia" });
  });

  it("sin gastos lo dice y no dibuja el gráfico de costo (e3)", () => {
    const spec = buildEventInfographic(analytics, "e3");
    expect(block(spec, "stats").items.map((i) => i.label)).toEqual(["Confirmados"]);
    expect(block(spec, "stats").items[0].value).toBe("3 de 4");
    expect(spec?.blocks.find((b) => b.type === "note")).toEqual({
      type: "note",
      text: "Este evento no tiene gastos cargados.",
    });
    expect(hasBlock(spec, "bars", "Confirmados")).toBe(true);
    expect(hasBlock(spec, "bars", "Costo por persona")).toBe(false);
    // Sin gastos ni fútbol no está en esos rankings: solo las posiciones donde tiene dato.
    expect(block(spec, "facts", "Posiciones entre los eventos pasados").rows.map((r) => r.label)).toEqual([
      "Confirmados",
      "Asistencia",
      "Invitados",
    ]);
    expect(spec?.chips).toEqual([]);
    expect(hasBlock(spec, "facts", "Fútbol")).toBe(false);
  });

  it("el lugar, si hay, va con la fecha", () => {
    const input = baseInput();
    input.events = input.events.map((e) => (e.id === "e3" ? { ...e, location: "Casa de Nico" } : e));
    const spec = buildEventInfographic(buildAnalytics(input), "e3");
    expect(spec?.subtitle).toBe(`${formatDayLong("2026-10-16T19:20:00Z")} · Casa de Nico`);
  });

  it("el próximo evento: sin posiciones ni comparación, y lo dice", () => {
    const spec = buildEventInfographic(analytics, "e4");
    expect(spec?.kicker).toBe("Evento en curso");
    expect(hasBlock(spec, "facts", "Posiciones entre los eventos pasados")).toBe(false);
    expect(hasBlock(spec, "bars")).toBe(false);
    expect(spec?.blocks.some((b) => b.type === "note" && b.text.startsWith("Todavía no pasó"))).toBe(true);
    expect(block(spec, "stats").items[0].value).toBe("2 de 4");
  });

  it("con pocas muestras no hay gráficos de comparación", () => {
    const input = baseInput();
    input.events = input.events.filter((e) => e.id !== "e3");
    expect(hasBlock(buildEventInfographic(buildAnalytics(input), "e1"), "bars")).toBe(false);
  });

  it("si hay otro evento con quién ubicarlo no inventa posiciones donde no hay", () => {
    const input = baseInput();
    input.events = input.events.filter((e) => e.id === "e1" || e.id === "e4");
    // Un solo evento pasado: nada que comparar, ninguna categoría con al menos 2.
    expect(hasBlock(buildEventInfographic(buildAnalytics(input), "e1"), "facts", "Posiciones entre los eventos pasados")).toBe(false);
  });
});

describe("buildMemberInfographic", () => {
  it("una persona que no existe no tiene infografía", () => {
    expect(buildMemberInfographic(analytics, "zz")).toBeNull();
  });

  describe("persona con historia (a)", () => {
    const spec = buildMemberInfographic(analytics, "a");

    it("encabezado: nombre, desde cuándo, iniciales y ruta", () => {
      expect(spec).toMatchObject({
        kicker: "Miembro",
        title: "A",
        // Se unió el 1/1 a las 00:00 UTC: en Argentina todavía es el 31/12.
        subtitle: "Desde dic 2025",
        avatarName: "A",
        chips: [],
        path: "/analytics/miembros/a",
        fileName: "miembro-a.jpg",
      });
      expect(spec?.shareLines).toEqual(["📊 A en la JAPA"]);
    });

    it("asistencia, racha, fútbol y premios", () => {
      expect(block(spec, "stats").items.map((i) => [i.label, i.value, i.note])).toEqual([
        ["Juntadas", "3 de 3", "100% de asistencia"],
        ["Racha", "3", "seguidas · mejor: 3"],
        ["Fútbol", "1 de 2", "50% de asistencia"],
        ["MVP", "2", null],
        ["Goleador", "0", null],
        ["Invitados que trajo", "1", null],
      ]);
    });

    it("puestos en el grupo, con los empates compartiendo puesto", () => {
      const rows = block(spec, "facts", "Puestos en el grupo").rows;
      expect(rows[0]).toEqual({ label: "Asistencia", value: "3 de 3", tag: "#1 de 3" });
      expect(rows.find((r) => r.label === "MVP")).toEqual({ label: "MVP", value: "2 veces", tag: "#1 de 1" });
    });

    it("tareas con su puesto en cada una", () => {
      expect(block(spec, "facts", "Tareas").rows).toEqual([
        { label: "Compra de insumos", value: "2 veces", tag: "#1 de 1" },
        { label: "Convocatoria", value: "2 veces", tag: "#1 de 2" },
      ]);
    });

    it("no lleva plata de personas", () => {
      const text = JSON.stringify(spec);
      expect(text).not.toMatch(/le toc|saldo|debe|deben|\$/i);
    });
  });

  it("sin partidos elegibles no hay bloque de fútbol, y sin puestos ni tareas no hay esos bloques", () => {
    const input = baseInput();
    input.members = [...input.members, member("n", "2026-10-27T00:00:00Z")];
    const spec = buildMemberInfographic(buildAnalytics(input), "n");
    expect(block(spec, "stats").items.map((i) => i.label)).toEqual(["Juntadas", "Racha", "MVP", "Goleador", "Invitados que trajo"]);
    expect(block(spec, "stats").items[0]).toMatchObject({ value: "—", note: "sin eventos todavía" });
    expect(hasBlock(spec, "facts", "Puestos en el grupo")).toBe(false);
    expect(hasBlock(spec, "facts", "Tareas")).toBe(false);
  });

  it("quien todavía no tiene historia suficiente no figura en el puesto de asistencia", () => {
    const spec = buildMemberInfographic(analytics, "d");
    const labels = spec ? block(spec, "facts", "Puestos en el grupo").rows.map((r) => r.label) : [];
    expect(labels).not.toContain("Asistencia");
    expect(labels).toContain("Racha");
  });
});

describe("buildRankingInfographic", () => {
  const people = buildPeopleMap(analytics.members);
  const { main, tasks } = buildMemberBoards(analytics.members);

  it("título del ranking, kicker, ruta y nombres", () => {
    const spec = buildRankingInfographic(main.mvp, people);
    expect(spec).toMatchObject({
      kicker: "Ranking",
      title: "MVP",
      subtitle: null,
      path: "/analytics?vista=miembros",
      fileName: "ranking-mvp.jpg",
      shareTitle: "Ranking: MVP",
    });
    expect(spec?.shareLines).toEqual(["📊 Ranking de la JAPA · MVP"]);
    expect(block(spec, "ranking").rows).toEqual([{ rank: 1, name: "A", value: 2, valueLabel: "2 veces", detail: null }]);
  });

  it("lleva la aclaración del ranking y su barra máxima", () => {
    const spec = buildRankingInfographic(main.asistencia, people);
    const ranking = block(spec, "ranking");
    expect(ranking.max).toBe(1);
    expect(ranking.note).toContain("«Voy» sobre los eventos pasados");
    // Incluye también a quien todavía no tiene puesto, marcado como nuevo.
    expect(ranking.rows.at(-1)).toMatchObject({ rank: null, name: "D", detail: "nuevo" });
  });

  it("el ranking de una tarea lleva el nombre de esa tarea", () => {
    const spec = buildRankingInfographic(tasks.compra_insumos, people);
    expect(spec?.title).toBe("Compra de insumos");
    expect(spec?.fileName).toBe("ranking-compra-de-insumos.jpg");
  });

  it("un ranking vacío no tiene infografía", () => {
    expect(buildRankingInfographic(tasks.reserva_cancha, people)).not.toBeNull();
    expect(buildRankingInfographic({ ...main.mvp, rows: [] }, people)).toBeNull();
  });

  it("dibuja hasta el límite y avisa cuántos más hay", () => {
    const rows = Array.from({ length: RANKING_LIMIT + 3 }, (_, i) => ({
      userId: i % 2 === 0 ? "a" : "b",
      rank: i + 1,
      value: 10 - i,
      label: `${i}`,
      detail: null,
    }));
    const board: Board = { ...main.mvp, rows };
    const ranking = block(buildRankingInfographic(board, people), "ranking");
    expect(ranking.rows).toHaveLength(RANKING_LIMIT);
    expect(ranking.more).toBe(3);
    expect(block(buildRankingInfographic(board, people, { limit: 5 }), "ranking").rows).toHaveLength(5);
  });

  it("una persona que no figura entre los miembros no rompe: «Alguien»", () => {
    const spec = buildRankingInfographic(main.mvp, {});
    expect(block(spec, "ranking").rows[0].name).toBe("Alguien");
  });
});

describe("límites", () => {
  it("el ranking de una infografía llega a 12 filas", () => {
    expect(RANKING_LIMIT).toBe(12);
  });
});

describe("infographicFileName", () => {
  it("el nombre sin tildes ni símbolos", () => {
    expect(infographicFileName("evento", "JAPA + Cumple Tato 🎂")).toBe("evento-japa-cumple-tato.jpg");
    expect(infographicFileName("miembro", "Ñandú Pérez")).toBe("miembro-nandu-perez.jpg");
  });

  it("sin letras ni números queda solo el prefijo", () => {
    expect(infographicFileName("ranking", "🎂🎂")).toBe("ranking.jpg");
    expect(infographicFileName("ranking", "")).toBe("ranking.jpg");
  });

  it("recorta los nombres largos sin dejar un guion colgando", () => {
    const name = infographicFileName("evento", "la gran juntada de fin de año con todos los amigos del barrio");
    expect(name).toBe("evento-la-gran-juntada-de-fin-de-ano-con-todos.jpg");
    expect(infographicFileName("evento", `${"a".repeat(39)} b`)).toBe(`evento-${"a".repeat(39)}.jpg`);
  });
});

describe("infographicShareText", () => {
  it("las líneas del epígrafe y, al final, el link a la pantalla de la app", () => {
    const spec = buildRankingInfographic(buildMemberBoards(analytics.members).main.mvp, buildPeopleMap(analytics.members));
    expect(spec && infographicShareText(spec, "https://japapp.example/analytics?vista=miembros")).toBe(
      "📊 Ranking de la JAPA · MVP\nMirala en la app: https://japapp.example/analytics?vista=miembros",
    );
  });
});

describe("no depende del reloj", () => {
  it("la misma entrada da la misma infografía", () => {
    expect(NOW.toISOString()).toBe("2026-10-28T12:00:00.000Z");
    expect(buildGeneralInfographic(buildAnalytics(baseInput()))).toEqual(buildGeneralInfographic(analytics));
  });
});
