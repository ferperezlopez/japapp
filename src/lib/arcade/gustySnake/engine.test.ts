import { describe, expect, it } from "vitest";
import { GUSTY_SNAKE_CONFIG as CONFIG, type FoodKind, type GustySnakeConfig } from "./config";
import {
  createInitialState,
  intervalForScore,
  nextRandom,
  placeFood,
  step,
  turn,
  type Direction,
  type Food,
  type GameState,
  type Point,
} from "./engine";
import { playWithBot } from "./testing";

const KINDS: FoodKind[] = CONFIG.foods.map((food) => food.kind);

/** Estado de prueba: por defecto sin comida, para que no se coma nada sin querer. */
function stateWith(overrides: Partial<GameState>): GameState {
  return { ...createInitialState(CONFIG, 1), food: null, ...overrides };
}

function line(...points: [number, number][]): Point[] {
  return points.map(([x, y]) => ({ x, y }));
}

function food(x: number, y: number, kind: FoodKind = "empanada"): Food {
  return { x, y, kind };
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

  it("arranca sin queso, con el reloj de juego en cero y sin nada pendiente de crecer", () => {
    const state = createInitialState(CONFIG, 1);
    expect(state.cheese).toBeNull();
    expect(state.nextCheeseAtMs).toBeNull();
    expect(state.clockMs).toBe(0);
    expect(state.grow).toBe(0);
  });

  it("la primera comida queda dentro del tablero, fuera de la serpiente y es de un tipo válido", () => {
    for (const seed of [0, 1, 2, 3, 12345, 999999, 4294967295]) {
      const state = createInitialState(CONFIG, seed);
      const first = state.food!;
      expect(first.x).toBeGreaterThanOrEqual(0);
      expect(first.x).toBeLessThan(CONFIG.cols);
      expect(first.y).toBeGreaterThanOrEqual(0);
      expect(first.y).toBeLessThan(CONFIG.rows);
      expect(state.snake.some((s) => s.x === first.x && s.y === first.y)).toBe(false);
      expect(KINDS).toContain(first.kind);
    }
  });

  it("es determinista: la misma semilla da la misma comida", () => {
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

  it("el reloj de juego suma el intervalo de cada movimiento, según el puntaje que ya se tenía", () => {
    let state = stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "right" });
    state = step(state, CONFIG);
    expect(state.clockMs).toBe(180);
    state = step(state, CONFIG);
    expect(state.clockMs).toBe(360);

    // Con 50 puntos cada movimiento es de 175 ms.
    const fast = step(stateWith({ snake: line([5, 5]), direction: "right", score: 50 }), CONFIG);
    expect(fast.clockMs).toBe(175);
  });

  describe.each(CONFIG.foods)("al comer $kind", ({ kind, points, growth }) => {
    const before = stateWith({
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      food: food(6, 5, kind),
    });

    it(`suma ${points} puntos y crece ${growth}`, () => {
      const after = step(before, CONFIG);
      expect(after.score).toBe(points);
      expect(after.snake).toHaveLength(before.snake.length + growth);
      expect(after.snake).toEqual(line([6, 5], [5, 5], [4, 5], [3, 5]));
      expect(after.ate).toBe(true);
      expect(after.status).toBe("running");
    });

    it("aparece otra comida en una celda libre, una sola a la vez", () => {
      const after = step(before, CONFIG);
      const next = after.food!;
      expect(after.snake.some((s) => s.x === next.x && s.y === next.y)).toBe(false);
      expect(next.x).toBeGreaterThanOrEqual(0);
      expect(next.x).toBeLessThan(CONFIG.cols);
      expect(next.y).toBeGreaterThanOrEqual(0);
      expect(next.y).toBeLessThan(CONFIG.rows);
      expect(KINDS).toContain(next.kind);
    });
  });

  it("con crecimiento mayor a 1 la cola se queda quieta ese tiempo", () => {
    const big: GustySnakeConfig = {
      ...CONFIG,
      foods: [{ kind: "olive", points: 5, growth: 3, weight: 1 }],
    };
    let state: GameState = {
      ...createInitialState(big, 1),
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      food: food(6, 5, "olive"),
    };
    const lengths: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = step(state, big);
      state = { ...state, food: state.ate ? null : state.food };
      lengths.push(state.snake.length);
    }
    // 3 → 4 al comer, y dos movimientos más sin avanzar la cola: 5 y 6.
    expect(lengths).toEqual([4, 5, 6, 6, 6]);
    expect(state.grow).toBe(0);
  });

  it("si come la última celda libre, llena el tablero y la partida termina", () => {
    const tiny: GustySnakeConfig = {
      ...CONFIG,
      cols: 2,
      rows: 2,
      initialLength: 1,
      foods: [{ kind: "empanada", points: 10, growth: 1, weight: 1 }],
    };
    const before: GameState = {
      ...createInitialState(tiny, 1),
      snake: line([1, 0], [0, 0], [0, 1]),
      direction: "down",
      food: food(1, 1),
      score: 20,
      ticks: 5,
      rng: 7,
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
      food: food(6, 5),
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
    expect(placeFood(small, snake, 99).food).toMatchObject({ x: 2, y: 1 });
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

  it("sortea los tres tipos con la misma probabilidad", () => {
    const counts: Record<string, number> = {};
    let rng = 2026;
    for (let i = 0; i < 3000; i++) {
      const placed = placeFood(CONFIG, line([9, 12]), rng);
      counts[placed.food!.kind] = (counts[placed.food!.kind] ?? 0) + 1;
      rng = placed.rng;
    }
    expect(Object.keys(counts).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(counts[kind]).toBeGreaterThan(850);
      expect(counts[kind]).toBeLessThan(1150);
    }
  });

  it("respeta los pesos de la config: peso 0 no sale nunca", () => {
    const weighted: GustySnakeConfig = {
      ...CONFIG,
      foods: [
        { kind: "olive", points: 5, growth: 1, weight: 0 },
        { kind: "empanada", points: 10, growth: 1, weight: 1 },
        { kind: "drumstick", points: 15, growth: 1, weight: 3 },
      ],
    };
    const counts: Record<string, number> = { olive: 0, empanada: 0, drumstick: 0 };
    let rng = 7;
    for (let i = 0; i < 2000; i++) {
      const placed = placeFood(weighted, line([9, 12]), rng);
      counts[placed.food!.kind]++;
      rng = placed.rng;
    }
    expect(counts.olive).toBe(0);
    // 3 de cada 4 son patitas.
    expect(counts.drumstick / 2000).toBeGreaterThan(0.7);
    expect(counts.drumstick / 2000).toBeLessThan(0.8);
  });

  it("con un queso en el tablero no cae sobre él ni donde el queso la deje inalcanzable", () => {
    // Pasillo de una fila: la cabeza en x=0 y el queso en x=2 dejan x=3 y x=4
    // fuera de su alcance; la única celda válida es x=1.
    const corridor = { ...CONFIG, cols: 5, rows: 1 };
    let rng = 1;
    for (let i = 0; i < 50; i++) {
      const placed = placeFood(corridor, line([0, 0]), rng, { x: 2, y: 0 });
      expect(placed.food).toMatchObject({ x: 1, y: 0 });
      rng = placed.rng;
    }
  });

  it("si el queso la deja toda inalcanzable, igual pone la comida en una celda libre", () => {
    const corridor = { ...CONFIG, cols: 4, rows: 1 };
    // Cabeza en x=0, queso en x=1: nada alcanzable; libres: x=2 y x=3.
    const placed = placeFood(corridor, line([0, 0]), 5, { x: 1, y: 0 });
    expect([2, 3]).toContain(placed.food!.x);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// VALORES DE ORO. Congelan el comportamiento exacto del motor (PRNG, colocación
// de comidas y queso, reglas de colisión y puntaje). Los replays que ya están
// guardados en la base solo se pueden volver a validar si el motor da lo mismo.
// Si alguno de estos tests falla porque cambiaste el motor o la configuración a
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

  it("primera comida (celda y tipo) según la semilla", () => {
    expect(createInitialState(CONFIG, 0).food).toEqual({ x: 0, y: 0, kind: "olive" });
    expect(createInitialState(CONFIG, 1).food).toEqual({ x: 1, y: 0, kind: "empanada" });
    expect(createInitialState(CONFIG, 12345).food).toEqual({ x: 5, y: 7, kind: "drumstick" });
    expect(createInitialState(CONFIG, 4294967295).food).toEqual({ x: 9, y: 4, kind: "drumstick" });
  });

  it.each([
    [12345, 440, 788, 124865],
    [777, 245, 485, 82065],
    [2026, 450, 824, 131270],
  ])(
    "partida completa del bot con semilla %i: %i puntos en %i movimientos (%i ms de juego)",
    (seed, score, ticks, clockMs) => {
      const session = playWithBot(CONFIG, seed, 20_000);
      expect(session.state.score).toBe(score);
      expect(session.state.ticks).toBe(ticks);
      expect(session.state.clockMs).toBe(clockMs);
      expect(session.state.status).toBe("over");
      expect(session.state.overReason).toBe("self");
    },
  );
});
