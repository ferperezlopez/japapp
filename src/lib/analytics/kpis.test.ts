import { describe, expect, it } from "vitest";
import { buildAnalytics } from "./build";
import { baseInput, event, expense, member, rsvp } from "./fixtures";
import { buildGeneralKpis } from "./kpis";

describe("buildGeneralKpis", () => {
  const kpis = (mutate: (input: ReturnType<typeof baseInput>) => void = () => undefined) => {
    const input = baseInput();
    mutate(input);
    return buildGeneralKpis(buildAnalytics(input).general);
  };

  it("los cuatro indicadores, en el orden de la pantalla", () => {
    expect(kpis().map((k) => k.metric)).toEqual(["confirmed", "ratio", "total", "costPerPerson"]);
  });

  it("valor y contexto de cada uno (con 3 eventos pasados, también la mediana)", () => {
    expect(kpis().map((k) => [k.label, k.value, k.hint])).toEqual([
      ["Confirmados", "2", "por evento: promedio · mediana 2"],
      ["Asistencia", "58%", "de los miembros, en promedio"],
      ["Gasto total", "$420", "promedio por evento $210"],
      ["Costo por persona", "$70", "promedio · mediana $70"],
    ]);
  });

  it("la variación es la del último evento contra el anterior", () => {
    const [confirmed, ratio, total, cost] = kpis();
    expect(confirmed.comparison).toMatchObject({ base: 1, diff: 2 });
    expect(ratio.comparison?.diff).toBeCloseTo(0.4167, 3);
    expect(total.comparison).toMatchObject({ base: 300, diff: -180 });
    expect(cost.comparison).toMatchObject({ base: 100, diff: -60 });
  });

  it("con pocas muestras (menos de 3 eventos pasados) no dice medianas", () => {
    const small = kpis((input) => {
      input.events = input.events.filter((e) => e.id !== "e3");
    });
    expect(small[0].hint).toBe("por evento, en promedio");
    expect(small[3].hint).toBe("promedio por evento");
  });

  it("sin gastos cargados: el gasto lo dice y el costo por persona es «—», no cero", () => {
    const none = kpis((input) => {
      input.expenses = [];
    });
    expect(none[2]).toMatchObject({ value: "$0", hint: "sin gastos cargados", comparison: null });
    expect(none[3]).toMatchObject({ value: "—", comparison: null });
  });

  it("la variación es contra el evento ANTERIOR, no contra el promedio de los otros", () => {
    // Tres eventos con gastos repartidos entre 2 personas, y 1, 3 y 2 confirmados:
    // para el último, el anterior (el del medio) y el promedio de los otros no coinciden.
    const events = [
      event("p1", "2026-10-01T20:00:00Z", { groupId: "q1" }),
      event("p2", "2026-10-08T20:00:00Z", { groupId: "q2" }),
      event("p3", "2026-10-15T20:00:00Z", { groupId: "q3" }),
    ];
    const members = ["a", "b", "c", "d"].map((id) => member(id));
    const confirmed = { p1: ["a"], p2: ["a", "b", "c"], p3: ["a", "b"] };
    const rsvps = Object.entries(confirmed).flatMap(([eventId, ids]) => ids.map((id) => rsvp(eventId, id, "yes")));
    const expenses = [
      expense("y1", "q1", "a", 100, ["a", "b"]),
      expense("y2", "q2", "a", 500, ["a", "b"]),
      expense("y3", "q3", "a", 300, ["a", "b"]),
    ];
    const result = buildGeneralKpis(
      buildAnalytics({ ...baseInput(), members, events, rsvps, expenses, guests: [], payments: [], futbol: [], tasks: [] }).general,
    );
    const [confirmedKpi, ratio, total, cost] = result;
    // Confirmados: 2 contra los 3 del anterior (el promedio de los otros sería 2: sin variación).
    expect(confirmedKpi.comparison).toMatchObject({ base: 3, diff: -1 });
    // Asistencia: 2 de 4 contra 3 de 4.
    expect(ratio.comparison?.base).toBeCloseTo(0.75);
    expect(ratio.comparison?.diff).toBeCloseTo(-0.25);
    // Gasto total: $300 contra $500 del anterior (el promedio de los otros es $300).
    expect(total.comparison).toMatchObject({ base: 500, diff: -200 });
    // Costo por persona: $150 contra $250 del anterior (el promedio de los otros es $150).
    expect(cost.comparison).toMatchObject({ base: 250, diff: -100 });
  });
});
