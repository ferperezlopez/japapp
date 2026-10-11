// Reglas de Gusty Snake. TypeScript puro: sin React, sin DOM, sin timers ni
// Math.random. Corre igual en el navegador (el juego) y en el servidor (que
// vuelve a simular cada partida para validar el puntaje, ver replay.ts).
//
// Es DETERMINISTA: dado el mismo `seed` y los mismos giros en los mismos
// movimientos, produce siempre exactamente la misma partida. Por eso las
// patitas se colocan con un generador pseudoaleatorio con semilla (mulberry32)
// en vez de Math.random, y por eso cualquier cambio en estas reglas obliga a
// subir `GustySnakeConfig.version`.

import type { GustySnakeConfig } from "./config";

export type Direction = "up" | "right" | "down" | "left";

/** El índice de cada dirección es su código en el replay. */
export const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];

export interface Point {
  x: number;
  y: number;
}

export const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

/** `wall`: pared. `self`: su propio cuerpo. `full`: llenó el tablero (¡ganó!). */
export type GameOverReason = "wall" | "self" | "full";

export interface GameState {
  /** snake[0] es la cabeza. */
  snake: Point[];
  direction: Direction;
  /** null solo si el tablero quedó completamente lleno. */
  food: Point | null;
  score: number;
  /** Movimientos hechos, incluido el fatal si lo hubo. */
  ticks: number;
  status: "running" | "over";
  overReason: GameOverReason | null;
  /** Estado del generador pseudoaleatorio (solo se usa para las patitas). */
  rng: number;
  /** El último movimiento comió una patita. */
  ate: boolean;
}

/**
 * mulberry32 en forma funcional: dado el estado devuelve un número en [0, 1)
 * y el estado siguiente. Usa solo operaciones enteras de 32 bits
 * (Math.imul y desplazamientos), así que da lo mismo en cualquier motor de JS.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

/**
 * Elige una celda libre al azar (con el generador con semilla) para la patita.
 * Devuelve `food: null` si no queda ninguna: el tablero está lleno.
 */
export function placeFood(
  config: GustySnakeConfig,
  snake: readonly Point[],
  rng: number,
): { food: Point | null; rng: number } {
  const { cols, rows } = config;
  const occupied = new Uint8Array(cols * rows);
  for (const segment of snake) occupied[segment.y * cols + segment.x] = 1;

  const free: number[] = [];
  for (let i = 0; i < occupied.length; i++) {
    if (occupied[i] === 0) free.push(i);
  }
  if (free.length === 0) return { food: null, rng };

  const random = nextRandom(rng);
  const cell = free[Math.floor(random.value * free.length)];
  return { food: { x: cell % cols, y: Math.floor(cell / cols) }, rng: random.state };
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
    score: 0,
    ticks: 0,
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

  const vector = DIRECTION_VECTORS[state.direction];
  const head: Point = { x: state.snake[0].x + vector.x, y: state.snake[0].y + vector.y };
  const ticks = state.ticks + 1;

  if (head.x < 0 || head.x >= config.cols || head.y < 0 || head.y >= config.rows) {
    return { ...state, ticks, status: "over", overReason: "wall", ate: false };
  }

  const eats = state.food !== null && head.x === state.food.x && head.y === state.food.y;

  // Si no come, la cola se mueve y libera su celda: se puede avanzar hacia
  // donde estaba la cola. Si come, la serpiente crece y la cola se queda.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  if (body.some((segment) => segment.x === head.x && segment.y === head.y)) {
    return { ...state, ticks, status: "over", overReason: "self", ate: false };
  }

  const snake = [head, ...body];
  if (!eats) return { ...state, snake, ticks, ate: false };

  const score = state.score + config.pointsPerFood;
  const placed = placeFood(config, snake, state.rng);
  return {
    ...state,
    snake,
    score,
    ticks,
    food: placed.food,
    rng: placed.rng,
    ate: true,
    // Sin celdas libres para la próxima patita: llenó el tablero.
    ...(placed.food === null ? { status: "over" as const, overReason: "full" as const } : {}),
  };
}

/**
 * Milisegundos entre movimientos para un puntaje dado: arranca en
 * `initialIntervalMs`, baja `intervalStepMs` cada `intervalStepEveryPoints`
 * puntos y nunca pasa de `minIntervalMs`.
 */
export function intervalForScore(score: number, config: GustySnakeConfig): number {
  const steps = Math.floor(score / config.intervalStepEveryPoints);
  return Math.max(config.minIntervalMs, config.initialIntervalMs - steps * config.intervalStepMs);
}
