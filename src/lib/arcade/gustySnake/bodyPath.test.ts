import { describe, expect, it } from "vitest";
import { bodyPoints } from "./bodyPath";
import { GUSTY_SNAKE_CONFIG as CONFIG } from "./config";
import { createInitialState, step, type GameState, type Point } from "./engine";
import { GustySession } from "./session";
import { chooseBotDirection } from "./testing";

function line(...points: [number, number][]): Point[] {
  return points.map(([x, y]) => ({ x, y }));
}

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...createInitialState(CONFIG, 1), food: null, ...overrides };
}

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

describe("bodyPoints", () => {
  it("sin avanzar (progreso 0) es el cuerpo anterior; avanzado del todo (1), el actual", () => {
    const previous = stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "right" });
    const next = step(previous, CONFIG);
    expect(bodyPoints(previous, next, 0)).toEqual(line([5, 5], [4, 5], [3, 5]));
    expect(bodyPoints(previous, next, 1)).toEqual(line([6, 5], [5, 5], [4, 5]));
  });

  it("a mitad de camino la cabeza y la cola van a medias", () => {
    const previous = stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "right" });
    const next = step(previous, CONFIG);
    expect(bodyPoints(previous, next, 0.5)).toEqual([
      { x: 5.5, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3.5, y: 5 },
    ]);
  });

  it("al crecer la cola se queda en su lugar y el cuerpo se alarga", () => {
    const previous = stateWith({
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      food: { x: 6, y: 5, kind: "olive" },
    });
    const next = step(previous, CONFIG);
    const halfway = bodyPoints(previous, next, 0.5);
    expect(halfway[halfway.length - 1]).toEqual({ x: 3, y: 5 });
    expect(halfway[0]).toEqual({ x: 5.5, y: 5 });
    expect(length(halfway)).toBeCloseTo(2.5);
    expect(length(bodyPoints(previous, next, 1))).toBeCloseTo(3);
  });

  it("sigue el recorrido real: en un giro de 90° pasa por la celda de la esquina", () => {
    const previous = stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "down" });
    const next = step(previous, CONFIG);
    const points = bodyPoints(previous, next, 0.6);
    expect(points[0]).toEqual({ x: 5, y: 5.6 });
    expect(points[1]).toEqual({ x: 5, y: 5 }); // la esquina
    expect(points[2]).toEqual({ x: 4, y: 5 });
  });

  it("una serpiente de un solo segmento es un punto", () => {
    const previous = stateWith({ snake: line([5, 5]), direction: "right" });
    const next = step(previous, CONFIG);
    const points = bodyPoints(previous, next, 0);
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });

  it("es continuo y no tiene huecos ni puntos repetidos en una partida entera (bot)", () => {
    const session = new GustySession(CONFIG, 2026);
    let checked = 0;
    while (session.state.status === "running" && session.state.ticks < 600) {
      const direction = chooseBotDirection(session.state, CONFIG);
      if (direction !== session.state.direction) session.queueDirection(direction);
      session.tick();
      const previous = session.previousState;
      const state = session.state;
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const points = bodyPoints(previous, state, progress);
        for (let i = 1; i < points.length; i++) {
          const gap = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
          // Puntos consecutivos: a lo sumo una celda de distancia y nunca iguales.
          expect(gap).toBeGreaterThan(0);
          expect(gap).toBeLessThanOrEqual(1 + 1e-9);
        }
        // Largo del cuerpo: no cambia mientras avanza sin comer; crece de a poco al comer.
        const before = previous.snake.length - 1;
        const expected = state.snake.length > previous.snake.length ? before + progress : before;
        expect(length(points)).toBeCloseTo(expected, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
