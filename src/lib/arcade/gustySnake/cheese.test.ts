import { describe, expect, it } from "vitest";
import { placeCheese, updateCheese, type CheeseInput } from "./cheese";
import { GUSTY_SNAKE_CONFIG as CONFIG, type GustySnakeConfig } from "./config";
import { createInitialState, intervalForScore, step, type GameState, type Point } from "./engine";
import { GustySession } from "./session";
import { chooseBotDirection } from "./testing";

function line(...points: [number, number][]): Point[] {
  return points.map(([x, y]) => ({ x, y }));
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe("placeCheese: dónde puede aparecer", () => {
  // Serpiente horizontal de 6 segmentos con la cabeza en (12, 12), mirando a la derecha.
  const snake = line([12, 12], [11, 12], [10, 12], [9, 12], [8, 12], [7, 12]);
  const food = { x: 5, y: 5 };

  it("nunca sobre la serpiente ni sobre la comida, ni a menos de 4 celdas de la cabeza", () => {
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, snake, "right", food, 0, seed);
      expect(cell).not.toBeNull();
      expect(snake.some((s) => s.x === cell!.x && s.y === cell!.y)).toBe(false);
      expect(cell).not.toEqual(food);
      expect(Math.abs(cell!.x - 12) + Math.abs(cell!.y - 12)).toBeGreaterThanOrEqual(
        CONFIG.cheese.minHeadDistance,
      );
    }
  });

  it("nunca directamente delante de la cabeza: ni en la franja que recorre en 900 ms", () => {
    // A 180 ms por movimiento son 5 celdas. En un tablero angosto esa franja
    // es una parte grande de las celdas posibles, así que el barrido la cubriría.
    const narrow: GustySnakeConfig = { ...CONFIG, cols: 12, rows: 3 };
    for (const seed of SEEDS) {
      const { cell } = placeCheese(narrow, line([1, 1]), "right", null, 0, seed);
      expect(cell).not.toBeNull();
      const inFront = cell!.y === 1 && cell!.x > 1 && cell!.x <= 1 + 5;
      expect(inFront).toBe(false);
    }
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, snake, "right", food, 0, seed);
      const inFront = cell!.y === 12 && cell!.x > 12 && cell!.x <= 12 + 5;
      expect(inFront).toBe(false);
    }
  });

  it("la franja de adelante vale para cada dirección", () => {
    const up = line([9, 12], [9, 13], [9, 14]);
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, up, "up", null, 0, seed);
      expect(cell!.x === 9 && cell!.y < 12 && cell!.y >= 12 - 5).toBe(false);
    }
    const left = line([9, 12], [10, 12], [11, 12]);
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, left, "left", null, 0, seed);
      expect(cell!.y === 12 && cell!.x < 9 && cell!.x >= 9 - 5).toBe(false);
    }
    const down = line([9, 12], [9, 11], [9, 10]);
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, down, "down", null, 0, seed);
      expect(cell!.x === 9 && cell!.y > 12 && cell!.y <= 12 + 5).toBe(false);
    }
  });

  it("a más velocidad la franja es más larga (siempre 900 ms de margen)", () => {
    // Con 900 puntos van 90 ms por movimiento: 10 celdas.
    expect(intervalForScore(900, CONFIG)).toBe(90);
    for (const seed of SEEDS) {
      const { cell } = placeCheese(CONFIG, snake, "right", food, 900, seed);
      expect(cell!.y === 12 && cell!.x > 12 && cell!.x <= 12 + 10).toBe(false);
    }
  });

  it("es determinista: los mismos datos dan el mismo queso", () => {
    expect(placeCheese(CONFIG, snake, "right", food, 0, 42)).toEqual(
      placeCheese(CONFIG, snake, "right", food, 0, 42),
    );
  });

  it("nunca le corta el camino al jugador: en un pasillo de una celda solo vale el final", () => {
    // Fila de 9 celdas con la cabeza en un extremo. Las celdas 6 y 7 cortarían
    // el acceso a lo que queda detrás; la 8 (la última) no corta nada.
    const corridor: GustySnakeConfig = { ...CONFIG, cols: 9, rows: 1 };
    for (const seed of SEEDS.slice(0, 60)) {
      const { cell } = placeCheese(corridor, line([0, 0]), "right", null, 0, seed);
      expect(cell).toEqual({ x: 8, y: 0 });
    }
  });

  it("si la cabeza no tiene a dónde ir, no pone ninguno", () => {
    const small: GustySnakeConfig = { ...CONFIG, cols: 3, rows: 3 };
    const enclosed = line([1, 1], [0, 1], [2, 1], [1, 0], [1, 2]);
    expect(placeCheese(small, enclosed, "right", null, 0, 1).cell).toBeNull();
  });

  it("si no hay ninguna celda válida, devuelve null y no toca el generador", () => {
    const corridor: GustySnakeConfig = { ...CONFIG, cols: 5, rows: 1 };
    expect(placeCheese(corridor, line([0, 0]), "right", null, 0, 77)).toEqual({
      cell: null,
      rng: 77,
    });
  });

  it("jamás deja inalcanzable algo que antes se alcanzaba (tablero con un muro y un solo hueco)", () => {
    // Un muro de cuerpo en x=3 (y=0..3) deja pasar solo por el hueco de abajo
    // (3,4): poner el queso en el hueco, o en la celda que le sigue, dejaría
    // sin acceso a todo el lado derecho.
    const walled: GustySnakeConfig = {
      ...CONFIG,
      cols: 7,
      rows: 5,
      cheese: { ...CONFIG.cheese, minHeadDistance: 2, safeAheadMs: 180 },
    };
    const snake = line([1, 2], [3, 0], [3, 1], [3, 2], [3, 3]);
    let placed = 0;
    for (const seed of SEEDS) {
      const { cell } = placeCheese(walled, snake, "left", null, 0, seed);
      if (!cell) continue;
      placed++;
      const before = flood(walled, snake, null);
      const after = flood(walled, snake, cell);
      const lost = [...before].filter((index) => !after.has(index));
      // Lo único que puede dejar de alcanzarse es la propia celda del queso.
      expect(lost.every((index) => index === cell.y * walled.cols + cell.x)).toBe(true);
    }
    expect(placed).toBeGreaterThan(150);
  });
});

/** Celdas alcanzables desde la cabeza (independiente de la implementación, para comparar). */
function flood(config: GustySnakeConfig, snake: Point[], extra: Point | null): Set<number> {
  const blocked = new Set(snake.map((s) => s.y * config.cols + s.x));
  if (extra) blocked.add(extra.y * config.cols + extra.x);
  const seen = new Set<number>();
  const queue = [snake[0]];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= config.cols || ny >= config.rows) continue;
      const index = ny * config.cols + nx;
      if (blocked.has(index) || seen.has(index)) continue;
      seen.add(index);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe("updateCheese: el ciclo", () => {
  const snake = line([12, 12], [11, 12], [10, 12]);
  const base: CheeseInput = {
    snake,
    direction: "right",
    food: { x: 5, y: 5 },
    score: 30,
    clockMs: 10_000,
    cheese: null,
    nextCheeseAtMs: null,
    rng: 1,
  };

  it("no hace nada antes del puntaje de arranque (30)", () => {
    const update = updateCheese(CONFIG, { ...base, score: 25 });
    expect(update).toEqual({ cheese: null, nextCheeseAtMs: null, rng: 1 });
  });

  it("al llegar a 30 agenda la primera aparición entre 1,5 y 3 s después", () => {
    for (const seed of SEEDS) {
      const update = updateCheese(CONFIG, { ...base, rng: seed });
      expect(update.cheese).toBeNull();
      expect(update.nextCheeseAtMs).toBeGreaterThanOrEqual(10_000 + 1500);
      expect(update.nextCheeseAtMs).toBeLessThanOrEqual(10_000 + 3000);
    }
  });

  it("aparece cuando toca y se queda entre 4 y 6 s", () => {
    for (const seed of SEEDS) {
      const update = updateCheese(CONFIG, { ...base, nextCheeseAtMs: 10_000, rng: seed });
      expect(update.cheese).not.toBeNull();
      expect(update.cheese!.spawnedAtMs).toBe(10_000);
      const life = update.cheese!.expiresAtMs - update.cheese!.spawnedAtMs;
      expect(life).toBeGreaterThanOrEqual(4000);
      expect(life).toBeLessThanOrEqual(6000);
      expect(update.nextCheeseAtMs).toBeNull();
    }
  });

  it("todavía no aparece si no llegó la hora", () => {
    const update = updateCheese(CONFIG, { ...base, nextCheeseAtMs: 10_001 });
    expect(update.cheese).toBeNull();
    expect(update.nextCheeseAtMs).toBe(10_001);
  });

  it("no se va antes de tiempo; al vencer desaparece y la próxima vez es 8–15 s después", () => {
    const cheese = { x: 3, y: 3, spawnedAtMs: 5000, expiresAtMs: 10_000 };
    const early = updateCheese(CONFIG, { ...base, cheese, clockMs: 9_999 });
    expect(early.cheese).toEqual(cheese);

    for (const seed of SEEDS) {
      const gone = updateCheese(CONFIG, { ...base, cheese, clockMs: 10_000, rng: seed });
      expect(gone.cheese).toBeNull();
      expect(gone.nextCheeseAtMs).toBeGreaterThanOrEqual(10_000 + 8000);
      expect(gone.nextCheeseAtMs).toBeLessThanOrEqual(10_000 + 15_000);
    }
  });

  it("si no encuentra ninguna celda válida, reintenta al segundo", () => {
    const corridor: GustySnakeConfig = { ...CONFIG, cols: 5, rows: 1 };
    const update = updateCheese(corridor, {
      ...base,
      snake: line([0, 0]),
      food: null,
      nextCheeseAtMs: 10_000,
    });
    expect(update.cheese).toBeNull();
    expect(update.nextCheeseAtMs).toBe(10_000 + CONFIG.cheese.retryMs);
  });

  it("es determinista", () => {
    const input = { ...base, nextCheeseAtMs: 10_000, rng: 99 };
    expect(updateCheese(CONFIG, input)).toEqual(updateCheese(CONFIG, input));
  });
});

describe("step: tocar el queso", () => {
  function stateWith(overrides: Partial<GameState>): GameState {
    return { ...createInitialState(CONFIG, 1), food: null, ...overrides };
  }
  const cheese = { x: 6, y: 5, spawnedAtMs: 0, expiresAtMs: 5000 };

  it("termina la partida al instante: la cabeza llega a la celda del queso y ahí muere", () => {
    const before = stateWith({
      snake: line([5, 5], [4, 5], [3, 5]),
      direction: "right",
      cheese,
      score: 40,
    });
    const after = step(before, CONFIG);
    expect(after.status).toBe("over");
    expect(after.overReason).toBe("cheese");
    expect(after.snake[0]).toEqual({ x: 6, y: 5 });
    expect(after.snake).toHaveLength(3);
    expect(after.ticks).toBe(1);
    expect(after.ate).toBe(false);
    expect(after.score).toBe(40);
  });

  it("después de morir, el estado ya no cambia", () => {
    const over = step(
      stateWith({ snake: line([5, 5], [4, 5], [3, 5]), direction: "right", cheese }),
      CONFIG,
    );
    expect(step(over, CONFIG)).toBe(over);
  });

  it("pasar al lado del queso no mata", () => {
    const after = step(
      stateWith({ snake: line([5, 6], [4, 6], [3, 6]), direction: "right", cheese }),
      CONFIG,
    );
    expect(after.status).toBe("running");
    expect(after.snake[0]).toEqual({ x: 6, y: 6 });
  });
});

describe("el queso en partidas reales (bot)", () => {
  interface Tick {
    before: GameState;
    after: GameState;
  }

  /** Juega con el bot y devuelve cada movimiento (estado antes y después). */
  function playTicks(seed: number, maxTicks: number): Tick[] {
    const session = new GustySession(CONFIG, seed);
    const ticks: Tick[] = [];
    while (session.state.status === "running" && session.state.ticks < maxTicks) {
      const direction = chooseBotDirection(session.state, CONFIG);
      if (direction !== session.state.direction) session.queueDirection(direction);
      const before = session.state;
      ticks.push({ before, after: session.tick() });
    }
    return ticks;
  }

  const RUNS = [12345, 777, 2026, 1, 2, 3, 4, 5].map((seed) => ({ seed, ticks: playTicks(seed, 1500) }));

  it("hay queso en las partidas largas, y nunca antes de los 30 puntos", () => {
    let spawns = 0;
    for (const { ticks } of RUNS) {
      for (const { before, after } of ticks) {
        if (after.score < CONFIG.cheese.startScore) expect(after.cheese).toBeNull();
        if (before.cheese === null && after.cheese !== null) spawns++;
      }
    }
    expect(spawns).toBeGreaterThan(8);
  });

  it("al aparecer, vive entre 4 y 6 s; se va dentro del movimiento en que vence", () => {
    for (const { ticks } of RUNS) {
      for (const { before, after } of ticks) {
        if (before.cheese === null && after.cheese !== null) {
          expect(after.cheese.spawnedAtMs).toBe(after.clockMs);
          const life = after.cheese.expiresAtMs - after.cheese.spawnedAtMs;
          expect(life).toBeGreaterThanOrEqual(4000);
          expect(life).toBeLessThanOrEqual(6000);
        }
        if (before.cheese !== null && after.cheese === null && after.status === "running") {
          expect(before.clockMs).toBeLessThan(before.cheese.expiresAtMs);
          expect(after.clockMs).toBeGreaterThanOrEqual(before.cheese.expiresAtMs);
        }
      }
    }
  });

  it("entre que desaparece y vuelve a aparecer pasan al menos 8 s de juego", () => {
    for (const { ticks } of RUNS) {
      let goneAt: number | null = null;
      for (const { before, after } of ticks) {
        if (before.cheese !== null && after.cheese === null && after.status === "running") {
          goneAt = after.clockMs;
        }
        if (before.cheese === null && after.cheese !== null && goneAt !== null) {
          expect(after.clockMs - goneAt).toBeGreaterThanOrEqual(8000);
        }
      }
    }
  });

  it("la primera aparición llega al menos 1,5 s de juego después de pasar los 30 puntos", () => {
    for (const { ticks } of RUNS) {
      let reached: number | null = null;
      for (const { after } of ticks) {
        if (reached === null && after.score >= CONFIG.cheese.startScore) reached = after.clockMs;
        if (after.cheese !== null && reached !== null) {
          expect(after.cheese.spawnedAtMs - reached).toBeGreaterThanOrEqual(1500);
          break;
        }
      }
    }
  });

  it("el queso nunca está sobre la serpiente ni sobre la comida, y hay uno solo", () => {
    for (const { ticks } of RUNS) {
      for (const { after } of ticks) {
        if (after.cheese === null) continue;
        const { x, y } = after.cheese;
        if (after.status === "running") {
          expect(after.snake.some((s) => s.x === x && s.y === y)).toBe(false);
        }
        expect(after.food !== null && after.food.x === x && after.food.y === y).toBe(false);
      }
    }
  });
});
