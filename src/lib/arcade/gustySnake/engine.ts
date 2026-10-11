// Reglas de Gusty Glotón. TypeScript puro: sin React, sin DOM, sin timers ni
// Math.random. Corre igual en el navegador (el juego) y en el servidor (que
// vuelve a simular cada partida para validar el puntaje, ver replay.ts).
//
// Es DETERMINISTA: dado el mismo `seed` y los mismos giros en los mismos
// movimientos, produce siempre exactamente la misma partida. Por eso las
// comidas y el queso se colocan con un generador pseudoaleatorio con semilla
// (mulberry32) en vez de Math.random, el queso corre en "tiempo de juego" y no
// en reloj, y por eso cualquier cambio en estas reglas obliga a subir
// `GustySnakeConfig.version`.

import { updateCheese, type Cheese } from "./cheese";
import type { FoodKind, FoodSpec, GustySnakeConfig } from "./config";
import { DIRECTION_VECTORS, OPPOSITE, type Direction, type Point } from "./directions";
import { reachableFromHead } from "./grid";
import { nextRandom } from "./random";
import { intervalForScore } from "./timing";

// El resto del código importa todo esto de "engine".
export { DIRECTIONS, DIRECTION_VECTORS, OPPOSITE } from "./directions";
export type { Direction, Point } from "./directions";
export type { Cheese } from "./cheese";
export { nextRandom } from "./random";
export { intervalForScore } from "./timing";

/**
 * `wall`: pared. `self`: su propio cuerpo. `cheese`: tocó el queso. `full`:
 * llenó el tablero (¡ganó!).
 */
export type GameOverReason = "wall" | "self" | "cheese" | "full";

/** Una comida en el tablero: su celda y de qué tipo es. */
export interface Food extends Point {
  kind: FoodKind;
}

export interface GameState {
  /** snake[0] es la cabeza. */
  snake: Point[];
  direction: Direction;
  /** Una sola a la vez. null solo si el tablero quedó completamente lleno. */
  food: Food | null;
  /** El queso que está en el tablero ahora, si hay. */
  cheese: Cheese | null;
  score: number;
  /** Movimientos hechos, incluido el fatal si lo hubo. */
  ticks: number;
  /**
   * Tiempo de juego transcurrido (ms): la suma del intervalo de cada
   * movimiento. Es el reloj del queso; no avanza mientras el juego está en pausa.
   */
  clockMs: number;
  /** Cuándo toca intentar la próxima aparición del queso (null: todavía no está agendada). */
  nextCheeseAtMs: number | null;
  /** Segmentos que le faltan crecer: la cola no avanza mientras haya. */
  grow: number;
  status: "running" | "over";
  overReason: GameOverReason | null;
  /** Estado del generador pseudoaleatorio (comidas y queso). */
  rng: number;
  /** El último movimiento comió una comida. */
  ate: boolean;
}

/** Sortea una comida según los pesos de la config. */
function pickFood(foods: readonly FoodSpec[], value: number): FoodSpec {
  const total = foods.reduce((sum, food) => sum + food.weight, 0);
  let remaining = value * total;
  for (const food of foods) {
    remaining -= food.weight;
    if (remaining < 0) return food;
  }
  return foods[foods.length - 1];
}

/**
 * Elige una comida (qué tipo, con el generador con semilla) y una celda libre
 * para ella. Devuelve `food: null` si no queda ninguna celda: el tablero está
 * lleno. Con un queso en el tablero, la comida cae donde la cabeza pueda
 * llegar sin pasar por el queso (si hay alguna celda así).
 */
export function placeFood(
  config: GustySnakeConfig,
  snake: readonly Point[],
  rng: number,
  cheese: Point | null = null,
): { food: Food | null; rng: number } {
  const { cols, rows } = config;
  const occupied = new Uint8Array(cols * rows);
  for (const segment of snake) occupied[segment.y * cols + segment.x] = 1;
  if (cheese) occupied[cheese.y * cols + cheese.x] = 1;

  let free: number[] = [];
  for (let i = 0; i < occupied.length; i++) {
    if (occupied[i] === 0) free.push(i);
  }
  if (free.length === 0) return { food: null, rng };

  if (cheese) {
    const reachable = reachableFromHead(config, snake, cheese).cells;
    const reachableFree = free.filter((cell) => reachable[cell] === 1);
    if (reachableFree.length > 0) free = reachableFree;
  }

  const kindRoll = nextRandom(rng);
  const spec = pickFood(config.foods, kindRoll.value);
  const cellRoll = nextRandom(kindRoll.state);
  const cell = free[Math.floor(cellRoll.value * free.length)];
  return {
    food: { x: cell % cols, y: Math.floor(cell / cols), kind: spec.kind },
    rng: cellRoll.state,
  };
}

/** Serpiente horizontal en el centro del tablero, mirando a la derecha. */
export function createInitialState(config: GustySnakeConfig, seed: number): GameState {
  const headX = Math.floor(config.cols / 2);
  const headY = Math.floor(config.rows / 2);
  if (config.initialLength < 1 || headX - (config.initialLength - 1) < 0) {
    throw new Error("La serpiente inicial no entra en el tablero.");
  }

  const snake: Point[] = [];
  for (let i = 0; i < config.initialLength; i++) snake.push({ x: headX - i, y: headY });

  const placed = placeFood(config, snake, seed >>> 0);
  return {
    snake,
    direction: "right",
    food: placed.food,
    cheese: null,
    score: 0,
    ticks: 0,
    clockMs: 0,
    nextCheeseAtMs: null,
    grow: 0,
    status: "running",
    overReason: null,
    rng: placed.rng,
    ate: false,
  };
}

/**
 * Cambia la dirección. Devuelve null si el giro no es válido: seguir en la
 * misma dirección no es un giro, y no se permite el de 180° (invertir
 * directamente el sentido de la marcha).
 */
export function turn(state: GameState, direction: Direction): GameState | null {
  if (direction === state.direction) return null;
  if (direction === OPPOSITE[state.direction]) return null;
  return { ...state, direction };
}

/**
 * Un movimiento. No modifica el estado recibido: devuelve uno nuevo (el
 * render puede conservar el anterior para interpolar la animación).
 * Si la partida ya terminó devuelve el mismo estado.
 */
export function step(state: GameState, config: GustySnakeConfig): GameState {
  if (state.status === "over") return state;

  // Antes de cada movimiento se espera el intervalo que corresponde al puntaje
  // que ya se tenía (mismo criterio que el runner y que verifyReplay).
  const clockMs = state.clockMs + intervalForScore(state.score, config);
  const vector = DIRECTION_VECTORS[state.direction];
  const head: Point = { x: state.snake[0].x + vector.x, y: state.snake[0].y + vector.y };
  const ticks = state.ticks + 1;

  if (head.x < 0 || head.x >= config.cols || head.y < 0 || head.y >= config.rows) {
    return { ...state, ticks, clockMs, status: "over", overReason: "wall", ate: false };
  }

  const eaten =
    state.food !== null && head.x === state.food.x && head.y === state.food.y ? state.food : null;
  const spec = eaten ? config.foods.find((food) => food.kind === eaten.kind) : undefined;
  const pendingGrowth = state.grow + (spec ? spec.growth : 0);
  const growsNow = pendingGrowth > 0;
  const grow = Math.max(0, pendingGrowth - 1);

  // Si no crece, la cola se mueve y libera su celda: se puede avanzar hacia
  // donde estaba la cola. Si crece, la serpiente se alarga y la cola se queda.
  const body = growsNow ? state.snake : state.snake.slice(0, -1);
  if (body.some((segment) => segment.x === head.x && segment.y === head.y)) {
    return { ...state, ticks, clockMs, status: "over", overReason: "self", ate: false };
  }

  const snake = [head, ...body];

  // Tocar el queso termina la partida: la cabeza llega a su celda y ahí muere.
  if (state.cheese && head.x === state.cheese.x && head.y === state.cheese.y) {
    return {
      ...state,
      snake,
      ticks,
      clockMs,
      grow,
      status: "over",
      overReason: "cheese",
      ate: false,
    };
  }

  let { score, food, rng } = state;
  if (eaten && spec) {
    score += spec.points;
    const placed = placeFood(config, snake, rng, state.cheese);
    food = placed.food;
    rng = placed.rng;
    // Sin celdas libres para la próxima comida: llenó el tablero.
    if (food === null) {
      return {
        ...state,
        snake,
        score,
        ticks,
        clockMs,
        grow,
        food,
        rng,
        ate: true,
        status: "over",
        overReason: "full",
      };
    }
  }

  const cheese = updateCheese(config, {
    snake,
    direction: state.direction,
    food,
    score,
    clockMs,
    cheese: state.cheese,
    nextCheeseAtMs: state.nextCheeseAtMs,
    rng,
  });

  return {
    ...state,
    snake,
    score,
    ticks,
    clockMs,
    grow,
    food,
    cheese: cheese.cheese,
    nextCheeseAtMs: cheese.nextCheeseAtMs,
    rng: cheese.rng,
    ate: eaten !== null,
  };
}
