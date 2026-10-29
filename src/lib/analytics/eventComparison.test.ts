import { describe, expect, it } from "vitest";
import { buildAnalytics } from "./build";
import { buildComparisonPoints, buildEventComparison, FEW_OTHERS, type ComparisonPoint } from "./eventComparison";
import { baseInput } from "./fixtures";

// Diez eventos pasados, uno por día (a las 20 h de Argentina): e1 = 1/1 … e10 = 10/1.
// Con fútbol los impares; confirmados = número del evento; gasto = 10 × número,
// salvo e3 (sin gastos); costo por persona solo en e5, e6 y e7.
const point = (i: number, over: Partial<ComparisonPoint> = {}): ComparisonPoint => ({
  id: `e${i}`,
  eventDate: `2026-01-${String(i).padStart(2, "0")}T23:00:00Z`,
  hasFutbol: i % 2 === 1,
  confirmed: i,
  ratio: i / 20,
  total: i === 3 ? null : i * 10,
  costPerPerson: i >= 5 && i <= 7 ? i * 2 : null,
  ...over,
});
const ten = Array.from({ length: 10 }, (_, k) => point(k + 1));

const chart = (model: ReturnType<typeof buildEventComparison>, key: string) => {
  const found = model?.charts.find((c) => c.key === key);
  if (!found) throw new Error(`falta el gráfico ${key}`);
  return found;
};

describe("buildEventComparison", () => {
  it("el próximo evento (o uno que no está) no se compara", () => {
    expect(buildEventComparison(ten, "zz")).toBeNull();
    expect(buildEventComparison([], "e1")).toBeNull();
  });

  it("un gráfico por indicador, con su tipo de variación y su polaridad", () => {
    const model = buildEventComparison(ten, "e5");
    expect(
      model?.charts.map((c) => [c.key, c.title, c.tone, c.kind, c.polarity]),
    ).toEqual([
      ["confirmed", "Confirmados", "eventos", "count", "higher-better"],
      ["ratio", "Asistencia", "eventos", "ratio", "higher-better"],
      ["total", "Gasto total", "gastos", "money", "lower-better"],
      ["costPerPerson", "Costo por persona", "gastos", "money", "lower-better"],
    ]);
  });

  describe("todos los demás", () => {
    const view = chart(buildEventComparison(ten, "e5"), "confirmed").views.all;

    it("muestra 8 eventos de alrededor (anteriores y posteriores) con el actual marcado", () => {
      expect(view.bars.map((b) => b.id)).toEqual(["e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"]);
      expect(view.bars.filter((b) => b.current).map((b) => b.id)).toEqual(["e5"]);
    });

    it("cada barra tiene su fecha corta, su valor, su texto y su link", () => {
      const bar = view.bars.find((b) => b.id === "e5");
      expect(bar).toEqual({
        id: "e5",
        label: "5/1",
        value: 5,
        valueLabel: "5",
        current: true,
        href: "/analytics/eventos/e5",
      });
    });

    it("la referencia es la mediana de los OTROS (sin el propio) y dice de cuántos sale", () => {
      // otros: 1 2 3 4 6 7 8 9 10 → mediana 6
      expect(view.reference).toBe(6);
      expect(view.referenceLabel).toBe("mediana 6");
      expect(view.caption).toBe("Mediana de los otros 9 eventos.");
    });

    it("compara este evento contra esa mediana", () => {
      expect(view.vsMedian).toEqual({ base: 6, diff: -1, pct: -1 / 6 });
    });
  });

  describe("similares", () => {
    const model = buildEventComparison(ten, "e5");
    const view = chart(model, "confirmed").views.similar;

    it("solo se dibujan y cuentan los eventos del mismo tipo (con fútbol), más el actual", () => {
      expect(view.bars.map((b) => b.id)).toEqual(["e1", "e3", "e5", "e7", "e9"]);
    });

    it("la mediana es solo de los similares y el texto dice de qué tipo", () => {
      // similares de e5 (sin contarlo): 1 3 7 9 → mediana 5
      expect(view.reference).toBe(5);
      expect(view.caption).toBe("Mediana de los otros 4 eventos con fútbol.");
      expect(view.vsMedian).toEqual({ base: 5, diff: 0, pct: 0 });
    });

    it("dice qué es «similar» y cuántos hay", () => {
      expect(model?.similarKind).toBe("con fútbol");
      expect(model?.similarCount).toBe(4);
      const sinFutbol = buildEventComparison(ten, "e4");
      expect(sinFutbol?.similarKind).toBe("sin fútbol");
      expect(sinFutbol?.similarCount).toBe(4);
    });

    it("sin ningún similar, sin mediana ni variación, y lo dice", () => {
      // e2 es el único sin fútbol.
      const lonely = buildEventComparison([point(1), point(2), point(3)], "e2");
      expect(lonely?.similarCount).toBe(0);
      const v = chart(lonely, "confirmed").views.similar;
      expect(v.bars.map((b) => b.id)).toEqual(["e2"]);
      expect(v.reference).toBeNull();
      expect(v.referenceLabel).toBe("mediana");
      expect(v.vsMedian).toBeNull();
      expect(v.caption).toBe("No hay otros eventos sin fútbol con este dato.");
    });
  });

  describe("eventos sin dato", () => {
    it("el evento sin gastos no dibuja barra ni cuenta en la mediana", () => {
      const view = chart(buildEventComparison(ten, "e5"), "total").views.all;
      const noExpenses = view.bars.find((b) => b.id === "e3");
      expect(noExpenses?.value).toBeNull();
      expect(noExpenses?.valueLabel).toBe("—");
      // otros con dato: 10 20 40 60 70 80 90 100 → mediana 65, de 8 eventos
      expect(view.reference).toBe(65);
      expect(view.referenceLabel).toBe("mediana $65");
      expect(view.caption).toBe("Mediana de los otros 8 eventos.");
      expect(view.vsMedian).toEqual({ base: 65, diff: -15, pct: -15 / 65 });
    });

    it("si este evento no tiene el dato no hay variación, aunque haya mediana", () => {
      const view = chart(buildEventComparison(ten, "e3"), "total").views.all;
      expect(view.reference).not.toBeNull();
      expect(view.vsMedian).toBeNull();
    });

    it("sin ningún otro evento con el dato, lo dice", () => {
      const view = chart(buildEventComparison(ten, "e5"), "costPerPerson").views.all;
      // otros con costo por persona: e6 12 y e7 14
      expect(view.reference).toBe(13);
      const alone = chart(buildEventComparison(ten, "e1"), "costPerPerson").views.all;
      expect(alone.vsMedian).toBeNull();
      const none = chart(buildEventComparison([point(1), point(2)], "e1"), "costPerPerson").views.all;
      expect(none.reference).toBeNull();
      expect(none.caption).toBe("No hay otros eventos con este dato.");
    });
  });

  describe("pocas muestras", () => {
    it("el umbral es de 3 eventos", () => {
      expect(FEW_OTHERS).toBe(3);
    });

    it("con 2 otros avisa; con 3 no", () => {
      const two = chart(buildEventComparison(ten.slice(0, 3), "e2"), "confirmed").views.all;
      expect(two.caption).toBe("Mediana de los otros 2 eventos. Pocas muestras.");
      const three = chart(buildEventComparison(ten.slice(0, 4), "e2"), "confirmed").views.all;
      expect(three.caption).toBe("Mediana de los otros 3 eventos.");
    });

    it("con 1 solo otro dice que se compara con uno solo (no es una mediana todavía)", () => {
      const one = chart(buildEventComparison(ten.slice(0, 2), "e2"), "confirmed").views.all;
      expect(one.caption).toBe("Se compara con 1 solo evento. Pocas muestras.");
      expect(one.reference).toBe(1);
      const similar = chart(buildEventComparison(ten.slice(0, 3), "e1"), "confirmed").views.similar;
      expect(similar.caption).toBe("Se compara con 1 solo evento con fútbol. Pocas muestras.");
    });
  });

  describe("ventana de barras", () => {
    const ids = (current: string, size?: number) =>
      chart(buildEventComparison(ten, current, size), "confirmed").views.all.bars.map((b) => b.id);

    it("pegada al principio y al final no se pasa", () => {
      expect(ids("e1")).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]);
      expect(ids("e10")).toEqual(["e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10"]);
    });

    it("con pocos eventos muestra todos", () => {
      const few = chart(buildEventComparison(ten.slice(0, 4), "e2"), "confirmed").views.all.bars;
      expect(few.map((b) => b.id)).toEqual(["e1", "e2", "e3", "e4"]);
    });

    it("respeta el tamaño pedido", () => {
      expect(ids("e5", 3)).toEqual(["e4", "e5", "e6"]);
    });
  });

  describe("formato de los valores", () => {
    it("asistencia en porcentaje y plata compacta", () => {
      const model = buildEventComparison(ten, "e5");
      const ratio = chart(model, "ratio").views.all;
      expect(ratio.bars.find((b) => b.id === "e5")?.valueLabel).toBe("25%");
      expect(ratio.referenceLabel).toBe("mediana 30%");
      const total = chart(model, "total").views.all;
      expect(total.bars.find((b) => b.id === "e5")?.valueLabel).toBe("$50");
    });
  });
});

describe("buildComparisonPoints", () => {
  const analytics = buildAnalytics(baseInput());
  const points = buildComparisonPoints(analytics.events);

  it("solo los eventos pasados, del más viejo al más nuevo (el próximo no se compara)", () => {
    expect(points.map((p) => p.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("lleva fecha, tipo y los valores de cada evento; sin gastos es null, no cero", () => {
    expect(points[0]).toEqual({
      id: "e1",
      eventDate: "2026-09-18T19:30:00Z",
      hasFutbol: true,
      confirmed: 2,
      ratio: 2 / 3,
      total: 300,
      costPerPerson: 100,
    });
    expect(points[2]).toMatchObject({ id: "e3", hasFutbol: false, confirmed: 3, total: null, costPerPerson: null });
  });

  it("sin eventos, vacío", () => {
    expect(buildComparisonPoints([])).toEqual([]);
  });

  it("no cambia el orden del arreglo que recibe", () => {
    const events = [...analytics.events];
    buildComparisonPoints(events);
    expect(events.map((e) => e.id)).toEqual(["e4", "e3", "e2", "e1"]);
  });
});
