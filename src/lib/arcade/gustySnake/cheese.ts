// El queso de Gusty Glotón: cuándo aparece, dónde y cuándo se va. TypeScript
// puro y determinista, como el resto del motor (usa el mismo generador con
// semilla, así el servidor repite exactamente la misma partida).
//
// Todo el reloj del queso es el "tiempo de juego" (`clockMs`): la suma del
// intervalo de cada movimiento. Se mueve solo cuando la serpiente se mueve, así
// que se congela al pausar, al cambiar de pestaña o al bloquear el teléfono.

import type { GustySnakeConfig } from "./config";
import { DIRECTION_VECTORS, type Direction, type Point } from "./directions";
import { reachableFromHead } from "./grid";
import { nextRandom, randomInt } from "./random";
import { intervalForScore } from "./timing";

export interface Cheese extends Point {
  /** Tiempo de juego (ms) en el que apareció. */
  spawnedAtMs: number;
  /** Tiempo de juego (ms) en el que desaparece. */
  expiresAtMs: number;
}

/** Celdas candidatas que se prueban, como máximo, antes de rendirse por esta vez. */
const MAX_ATTEMPTS = 24;

/**
 * Elige una celda para el queso, o null si no hay ninguna válida. Una celda es
 * válida si:
 *  - está libre: ni serpiente ni comida;
 *  - no está en la franja recta que la cabeza recorre en los próximos
 *    `safeAheadMs` (a la velocidad actual), ni a menos de `minHeadDistance`
 *    celdas de ella: tiene que haber tiempo de verlo y esquivarlo;
 *  - no le corta el camino al jugador: todo lo que la cabeza podía alcanzar
 *    sin el queso (la comida incluida) lo sigue alcanzando con él.
 */
export function placeCheese(
  config: GustySnakeConfig,
  snake: readonly Point[],
  direction: Direction,
  food: Point | null,
  score: number,
  rng: number,
): { cell: Point | null; rng: number } {
  const { cols, rows, cheese: options } = config;
  const head = snake[0];

  const occupied = new Uint8Array(cols * rows);
  for (const segment of snake) occupied[segment.y * cols + segment.x] = 1;
  if (food) occupied[food.y * cols + food.x] = 1;

  const vector = DIRECTION_VECTORS[direction];
  const ahead = Math.max(
    options.minHeadDistance,
    Math.ceil(options.safeAheadMs / intervalForScore(score, config)),
  );
  const isForbidden = (x: number, y: number): boolean => {
    const dx = x - head.x;
    const dy = y - head.y;
    if (Math.abs(dx) + Math.abs(dy) < options.minHeadDistance) return true;
    const along = vector.x !== 0 ? dx * vector.x : dy * vector.y;
    const across = vector.x !== 0 ? dy : dx;
    return across === 0 && along > 0 && along <= ahead;
  };

  const candidates: number[] = [];
  for (let index = 0; index < occupied.length; index++) {
    if (occupied[index] === 0 && !isForbidden(index % cols, Math.floor(index / cols))) {
      candidates.push(index);
    }
  }

  // Sin camino libre desde la cabeza no hay nada que proteger (ni dónde poner nada).
  const before = reachableFromHead(config, snake);
  if (before.count === 0) return { cell: null, rng };

  let state = rng;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && candidates.length > 0; attempt++) {
    const random = nextRandom(state);
    state = random.state;
    const pick = Math.floor(random.value * candidates.length);
    const index = candidates[pick];
    candidates[pick] = candidates[candidates.length - 1];
    candidates.pop();

    const cell = { x: index % cols, y: Math.floor(index / cols) };
    const after = reachableFromHead(config, snake, cell);
    // Bloquear esta celda solo puede sacar a la propia celda de lo alcanzable.
    const expected = before.count - before.cells[index];
    if (after.count === expected) return { cell, rng: state };
  }
  return { cell: null, rng: state };
}

export interface CheeseInput {
  snake: readonly Point[];
  direction: Direction;
  food: Point | null;
  score: number;
  /** Tiempo de juego (ms) al terminar este movimiento. */
  clockMs: number;
  cheese: Cheese | null;
  /** Cuándo toca intentar la próxima aparición (null: todavía no está agendada). */
  nextCheeseAtMs: number | null;
  rng: number;
}

export interface CheeseUpdate {
  cheese: Cheese | null;
  nextCheeseAtMs: number | null;
  rng: number;
}

/**
 * Avanza el ciclo del queso un movimiento: se va si venció, se agenda la
 * primera aparición al llegar al puntaje de arranque, y aparece cuando toca.
 */
export function updateCheese(config: GustySnakeConfig, input: CheeseInput): CheeseUpdate {
  const options = config.cheese;
  const { clockMs, score } = input;
  let { cheese, nextCheeseAtMs, rng } = input;

  if (cheese !== null && clockMs >= cheese.expiresAtMs) {
    cheese = null;
    const gap = randomInt(rng, options.gapMs[0], options.gapMs[1]);
    rng = gap.state;
    nextCheeseAtMs = clockMs + gap.value;
  }

  if (cheese === null && nextCheeseAtMs === null && score >= options.startScore) {
    const delay = randomInt(rng, options.firstDelayMs[0], options.firstDelayMs[1]);
    rng = delay.state;
    nextCheeseAtMs = clockMs + delay.value;
  }

  if (cheese === null && nextCheeseAtMs !== null && clockMs >= nextCheeseAtMs) {
    const placed = placeCheese(config, input.snake, input.direction, input.food, score, rng);
    rng = placed.rng;
    if (placed.cell) {
      const life = randomInt(rng, options.lifetimeMs[0], options.lifetimeMs[1]);
      rng = life.state;
      cheese = { ...placed.cell, spawnedAtMs: clockMs, expiresAtMs: clockMs + life.value };
      nextCheeseAtMs = null;
    } else {
      nextCheeseAtMs = clockMs + options.retryMs;
    }
  }

  return { cheese, nextCheeseAtMs, rng };
}
