import { describe, expect, it } from "vitest";
import { GUSTY_SNAKE_CONFIG as CONFIG } from "./config";
import {
  createInitialState,
  intervalForScore,
  nextRandom,
  placeFood,
  step,
  turn,
  type Direction,
  type GameState,
  type Point,
} from "./engine";
import { playWithBot } from "./testing";

/** Estado de prueba: por defecto sin patita, para que no se coma nada sin querer. */
function stateWith(overrides: Partial<GameState>): GameState {
  return { ...createInitialState(CONFIG, 1), food: null, ...overrides };
}

function line(...points: [number, number][]): Point[] {
  return points.map(([x, y]) => ({ x, y }));
}

describe("createInitialState", () => {
  it("arranca con 3 segmentos horizontales en el centro, mirando a la derecha", () => {
    const state = createInitialState(CONFIG, 1);
    expect(state.snake).toEqual(line([9, 12], [8, 12], [7, 12]));
    expect(state.direction).toBe("right");
    expect(state.score).toBe(0);
    expect(state.ticks).toBe(0);
    expect(state.status).toBe("running");
    expect(state.overReason).toBeNull();
    expect(state.ate).toBe(false);
  });

  it("la primera patita queda dentro del tablero y fuera de la serpiente", () => {
    for (const seed of [0, 1, 2, 3, 12345, 999999, 4294967295]) {
      const state = createInitialState(CONFIG, seed);
      const food = state.food!;
      expect(food.x).toBeGreaterThanOrEqual(0);
      expect(food.x).toBeLessThan(CONFIG.cols);
      expect(food.y).toBeGreaterThanOrEqual(0);
      expect(food.y).toBeLessThan(CONFIG.rows);
      expect(state.snake.some((s) => s.x === food.x && s.y === food.y)).toBe(false);
    }
  });

  it("es determinista: la misma semilla da la misma patita", () => {
    expect(createInitialState(CONFIG, 777).food).toEqual(createInitialState(CONFIG, 777).food);
  });

  it("falla si la serpiente inicial no entra en el tablero", () => {
    expect(() => createInitialState({ ...CONFIG, cols: 4, initialLength: 5 }, 1)).toThrow();
  });
});

describe("step", () => {
  it.each<[Direction, Point]>([
    ["up", { x: 5, y: 4 }],
    ["right", { x: 6, y: 5 }],
    ["down", { x: 5, y: 6 }],
    ["left", { x: 4, y: 5 }],
  ])("avanza una celda hacia %s", (direction, expectedHead) => {
    const before = stateWith({ snake: line([5, 5]), direction });
    const after = step(before, CONFIG);
    expect(after.snake).toEqual([expectedHead]);
    expect(after.ticks).toBe(1);
    expect(after.status).toBe("running");
  });

  it("el cuerpo sigue a la cabeza y no cambia el largo al avanzar sin comer", () => {
    const before = stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "right" });
    const after = step(before, CONFIG);
    expect(after.snake).toEqual(line([6, 5], [5, 5], [4, 5]));
    expect(after.score).toBe(0);
    expect(after.ate).toBe(false);
  });

  it.each<[Direction, [number, number][]]>([
    ["up", [[5, 0], [5, 1], [5, 2]]],
    ["down", [[5, 23], [5, 22], [5, 21]]],
    ["left", [[0, 5], [1, 5], [2, 5]]],
    ["right", [[17, 5], [16, 5], [15, 5]]],
  ])("termina contra la pared de %s sin mover la serpiente", (direction, cells) => {
    const before = stateWith({ snake: line(...cells), direction });
    const after = step(before, CONFIG);
    expect(after.status).toBe("over");
    expect(after.overReason).toBe("wall");
    expect(after.snake).toEqual(before.snake);
    expect(after.ticks).toBe(1);
    expect(after.ate).toBe(false);
  });

  it("termina al chocar con su propio cuerpo", () => {
    // La cabeza (1,2) avanza a la derecha hacia (2,2), que es un segmento
    // del cuerpo (no la cola, que está en (2,1)).
    const before = stateWith({
      snake: line([1, 2], [1, 3], [2, 3], [2, 2], [2, 1]),
      direction: "right",
    });
    const after = step(before, CONFIG);
    expect(after.status).toBe("over");
    expect(after.overReason).toBe("self");
    expect(after.snake).toEqual(before.snake);
  });

  it("puede avanzar hacia la celda de su cola: la cola se corre y la libera", () => {
    // Cuadrado de 2x2: la cabeza avanza hacia donde está la cola.
    const before = stateWith({
      snake: line([1, 1], [1, 0], [0, 0], [0, 1]),
      direction: "left",
    });
    const after = step(before, CONFIG);
    expect(after.status).toBe("running");
    expect(after.snake).toEqual(line([0, 1], [1, 1], [1, 0], [0, 0]));
  });

  it("al comer una patita crece, suma puntos y aparece otra en una celda libre", () => {
    const before = stateWith({
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      food: { x: 6, y: 5 },
    });
    const after = step(before, CONFIG);
    expect(after.snake).toEqual(line([6, 5], [5, 5], [4, 5], [3, 5]));
    expect(after.score).toBe(CONFIG.pointsPerFood);
    expect(after.ate).toBe(true);
    expect(after.status).toBe("running");
    const food = after.food!;
    expect(after.snake.some((s) => s.x === food.x && s.y === food.y)).toBe(false);
    expect(food.x).toBeGreaterThanOrEqual(0);
    expect(food.x).toBeLessThan(CONFIG.cols);
    expect(food.y).toBeGreaterThanOrEqual(0);
    expect(food.y).toBeLessThan(CONFIG.rows);
  });

  it("si come la última celda libre, llena el tablero y la partida termina", () => {
    const tiny = { ...CONFIG, cols: 2, rows: 2, initialLength: 1 };
    const before: GameState = {
      snake: line([1, 0], [0, 0], [0, 1]),
      direction: "down",
      food: { x: 1, y: 1 },
      score: 20,
      ticks: 5,
      status: "running",
      overReason: null,
      rng: 7,
      ate: false,
    };
    const after = step(before, tiny);
    expect(after.status).toBe("over");
    expect(after.overReason).toBe("full");
    expect(after.food).toBeNull();
    expect(after.score).toBe(30);
    expect(after.snake).toHaveLength(4);
  });

  it("con la partida terminada devuelve el mismo estado", () => {
    const over = step(
      stateWith({ snake: line([0, 5], [1, 5], [2, 5]), direction: "left" }),
      CONFIG,
    );
    expect(over.status).toBe("over");
    expect(step(over, CONFIG)).toBe(over);
  });

  it("no modifica el estado recibido", () => {
    const before = stateWith({
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      food: { x: 6, y: 5 },
    });
    const copy = structuredClone(before);
    step(before, CONFIG);
    expect(before).toEqual(copy);
  });
});

describe("turn", () => {
  const state = stateWith({ direction: "right" });

  it("permite girar en perpendicular", () => {
    expect(turn(state, "up")?.direction).toBe("up");
    expect(turn(state, "down")?.direction).toBe("down");
  });

  it("no permite el giro de 180°", () => {
    expect(turn(state, "left")).toBeNull();
  });

  it("seguir en la misma dirección no es un giro", () => {
    expect(turn(state, "right")).toBeNull();
  });

  it("no modifica el estado recibido", () => {
    turn(state, "up");
    expect(state.direction).toBe("right");
  });
});

describe("intervalForScore", () => {
  it.each([
    [0, 180],
    [40, 180],
    [50, 175],
    [100, 170],
    [850, 95],
    [900, 90],
    [950, 90],
    [5000, 90],
  ])("con %i puntos van %i ms por movimiento", (score, expected) => {
    expect(intervalForScore(score, CONFIG)).toBe(expected);
  });

  it("respeta una configuración distinta", () => {
    const custom = { ...CONFIG, initialIntervalMs: 200, intervalStepMs: 10, minIntervalMs: 150 };
    expect(intervalForScore(0, custom)).toBe(200);
    expect(intervalForScore(100, custom)).toBe(180);
    expect(intervalForScore(1000, custom)).toBe(150);
  });
});

describe("nextRandom", () => {
  it("da siempre números en [0, 1)", () => {
    let state = 42;
    for (let i = 0; i < 2000; i++) {
      const next = nextRandom(state);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      state = next.state;
    }
  });

  it("es determinista: el mismo estado da el mismo resultado", () => {
    expect(nextRandom(123)).toEqual(nextRandom(123));
  });

  it("no se queda trabado: el estado avanza", () => {
    expect(nextRandom(5).state).not.toBe(5);
  });
});

describe("placeFood", () => {
  it("elige la única celda libre", () => {
    const small = { ...CONFIG, cols: 3, rows: 2 };
    const snake = line([0, 0], [1, 0], [2, 0], [0, 1], [1, 1]);
    expect(placeFood(small, snake, 99).food).toEqual({ x: 2, y: 1 });
  });

  it("devuelve null si el tablero está lleno", () => {
    const small = { ...CONFIG, cols: 3, rows: 2 };
    const snake = line([0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]);
    expect(placeFood(small, snake, 99).food).toBeNull();
  });

  it("nunca cae sobre la serpiente, aunque ocupe casi todo el tablero", () => {
    const small = { ...CONFIG, cols: 5, rows: 5 };
    // Serpiente que recorre todas las filas menos la última.
    const snake: Point[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) snake.push({ x, y });
    let rng = 1;
    for (let i = 0; i < 100; i++) {
      const placed = placeFood(small, snake, rng);
      expect(placed.food!.y).toBe(4);
      rng = placed.rng;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// VALORES DE ORO. Congelan el comportamiento exacto del motor (PRNG, colocación
// de patitas, reglas de colisión y puntaje). Los replays que ya están guardados
// en la base solo se pueden volver a validar si el motor da lo mismo. Si
// alguno de estos tests falla porque cambiaste el motor o la configuración a
// propósito: subí GUSTY_SNAKE_CONFIG.version y actualizá estos valores.
// ─────────────────────────────────────────────────────────────────────────
describe("valores de oro (si fallan: subir GUSTY_SNAKE_CONFIG.version)", () => {
  it("primeros números del generador pseudoaleatorio con semilla 1", () => {
    let state = 1;
    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextRandom(state);
      values.push(next.value);
      state = next.state;
    }
    expect(values).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it("primera patita según la semilla", () => {
    expect(createInitialState(CONFIG, 0).food).toEqual({ x: 6, y: 6 });
    expect(createInitialState(CONFIG, 1).food).toEqual({ x: 2, y: 15 });
    expect(createInitialState(CONFIG, 12345).food).toEqual({ x: 9, y: 23 });
    expect(createInitialState(CONFIG, 4294967295).food).toEqual({ x: 9, y: 21 });
  });

  it.each([
    [12345, 230, 319],
    [777, 210, 315],
    [2026, 250, 305],
  ])("partida completa del bot con semilla %i: %i puntos en %i movimientos", (seed, score, ticks) => {
    const session = playWithBot(CONFIG, seed, 20_000);
    expect(session.state.score).toBe(score);
    expect(session.state.ticks).toBe(ticks);
    expect(session.state.status).toBe("over");
    expect(session.state.overReason).toBe("self");
  });
});
