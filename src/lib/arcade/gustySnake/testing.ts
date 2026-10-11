// Ayudas SOLO para los tests: un "bot" voraz que juega partidas reales con el
// motor (para tener replays con comidas comidas, giros y colisiones). No lo
// importa nada de la app.

import type { GustySnakeConfig } from "./config";
import { OPPOSITE, step, turn, type Direction, type GameState, type Point } from "./engine";
import { GustySession } from "./session";

const ALL: readonly Direction[] = ["up", "right", "down", "left"];

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Elige hacia dónde ir: lo que no choque (el queso incluido: `step` lo marca
 * como muerte) y más acerque a la comida.
 */
export function chooseBotDirection(state: GameState, config: GustySnakeConfig): Direction {
  let best: Direction = state.direction;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const direction of ALL) {
    if (direction === OPPOSITE[state.direction]) continue;
    const candidate = turn(state, direction) ?? state;
    const next = step(candidate, config);
    if (next.status === "over" && next.overReason !== "full") continue;

    // Comer es lo mejor; si no, acercarse a la comida actual.
    const target = state.food;
    const toTarget =
      next.score > state.score || target === null ? -1 : distance(next.snake[0], target);
    // A igual distancia se prefiere seguir derecho (menos giros).
    const penalty = direction === state.direction ? 0 : 0.1;
    if (toTarget + penalty < bestScore) {
      bestScore = toTarget + penalty;
      best = direction;
    }
  }
  return best;
}

/** Juega una partida completa con el bot (o hasta `maxTicks` movimientos). */
export function playWithBot(
  config: GustySnakeConfig,
  seed: number,
  maxTicks: number,
): GustySession {
  const session = new GustySession(config, seed);
  while (session.state.status === "running" && session.state.ticks < maxTicks) {
    const direction = chooseBotDirection(session.state, config);
    if (direction !== session.state.direction) session.queueDirection(direction);
    session.tick();
  }
  return session;
}

/** Hacia dónde ir para chocar con el queso por el camino más corto que no choque con otra cosa. */
function chooseCheeseDirection(state: GameState, config: GustySnakeConfig): Direction {
  const cheese = state.cheese;
  if (cheese === null) return chooseBotDirection(state, config);

  let best: Direction = state.direction;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const direction of ALL) {
    if (direction === OPPOSITE[state.direction]) continue;
    const next = step(turn(state, direction) ?? state, config);
    if (next.overReason === "cheese") return direction;
    if (next.status === "over") continue;
    const toCheese = distance(next.snake[0], cheese);
    if (toCheese < bestDistance) {
      bestDistance = toCheese;
      best = direction;
    }
  }
  return best;
}

/**
 * Juega como el bot hasta que aparece un queso y entonces se le tira encima.
 * Devuelve la partida si terminó por queso, o null si terminó de otra forma
 * (o se quedó sin movimientos) antes.
 */
export function playUntilCheeseDeath(
  config: GustySnakeConfig,
  seed: number,
  maxTicks: number,
): GustySession | null {
  const session = new GustySession(config, seed);
  while (session.state.status === "running" && session.state.ticks < maxTicks) {
    const direction = chooseCheeseDirection(session.state, config);
    if (direction !== session.state.direction) session.queueDirection(direction);
    session.tick();
  }
  return session.state.overReason === "cheese" ? session : null;
}
