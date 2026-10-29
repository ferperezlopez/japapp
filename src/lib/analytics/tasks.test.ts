import { describe, expect, it } from "vitest";
import { TASK_KEYS, TASK_LABELS, TASK_SHORT_LABELS, countTasks, emptyTaskCounts } from "./tasks";
import { event, task } from "./fixtures";

const e1 = event("e1", "2026-09-18T19:30:00Z", { createdBy: "a" });
const e2 = event("e2", "2026-10-02T20:00:00Z", { createdBy: "b" });

describe("emptyTaskCounts", () => {
  it("todo en cero, con un lugar por cada tipo, y cada llamada devuelve uno nuevo", () => {
    const counts = emptyTaskCounts();
    expect(counts.total).toBe(0);
    expect(Object.keys(counts.byType).sort()).toEqual([...TASK_KEYS].sort());
    counts.byType.compra_insumos = 5;
    expect(emptyTaskCounts().byType.compra_insumos).toBe(0);
  });

  it("todos los tipos tienen rótulo largo y corto", () => {
    for (const key of TASK_KEYS) {
      expect(TASK_LABELS[key]).toBeTruthy();
      expect(TASK_SHORT_LABELS[key]).toBeTruthy();
    }
  });
});

describe("countTasks", () => {
  it("cuenta cada persona una vez por evento y tipo, aunque tenga varias filas (varios insumos)", () => {
    const counts = countTasks(
      [e1],
      [task("e1", "compra_insumos", "a"), task("e1", "compra_insumos", "a"), task("e1", "compra_insumos", "a")],
    );
    expect(counts.get("a")?.byType.compra_insumos).toBe(1);
  });

  it("suma los eventos distintos y los tipos distintos", () => {
    const counts = countTasks(
      [e1, e2],
      [
        task("e1", "compra_insumos", "c"),
        task("e2", "compra_insumos", "c"),
        task("e2", "lavado_platos", "c"),
        task("e1", "reserva_cancha", "c"),
      ],
    );
    expect(counts.get("c")?.byType).toMatchObject({ compra_insumos: 2, lavado_platos: 1, reserva_cancha: 1, orden_sede: 0 });
    expect(counts.get("c")?.total).toBe(4);
  });

  it("varias personas en la misma tarea suman cada una", () => {
    const counts = countTasks([e1], [task("e1", "orden_sede", "c"), task("e1", "orden_sede", "d")]);
    expect(counts.get("c")?.byType.orden_sede).toBe(1);
    expect(counts.get("d")?.byType.orden_sede).toBe(1);
  });

  it("ignora las tareas de eventos que no son los pedidos (por ejemplo, el próximo)", () => {
    const counts = countTasks([e1], [task("e1", "orden_sede", "c"), task("proximo", "orden_sede", "c")]);
    expect(counts.get("c")?.total).toBe(1);
  });

  it("la convocatoria es quien creó el evento, y solo de los eventos pedidos", () => {
    const counts = countTasks([e1, e2], []);
    expect(counts.get("a")?.byType.convocatoria).toBe(1);
    expect(counts.get("b")?.byType.convocatoria).toBe(1);
    expect(counts.get("a")?.total).toBe(1);
    expect(countTasks([e1], []).get("b")).toBeUndefined();
  });

  it("un evento sin creador no suma convocatoria a nadie", () => {
    const counts = countTasks([event("e9", "2026-10-02T20:00:00Z")], []);
    expect(counts.size).toBe(0);
  });

  it("quien convocó y además se anotó en una tarea suma las dos", () => {
    const counts = countTasks([e1], [task("e1", "lavado_platos", "a")]);
    expect(counts.get("a")?.byType).toMatchObject({ convocatoria: 1, lavado_platos: 1 });
    expect(counts.get("a")?.total).toBe(2);
  });

  it("sin eventos ni tareas no hay nada", () => {
    expect(countTasks([], [task("e1", "orden_sede", "a")]).size).toBe(0);
  });
});
