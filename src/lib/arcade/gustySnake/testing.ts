// Ayudas SOLO para los tests: un "bot" voraz que juega partidas reales con el
// motor (para tener replays con patitas comidas, giros y colisiones). No lo
// importa nada de la app.

import type { GustySnakeConfig } from "./config";
import { OPPOSITE, step, turn, type Direction, type GameState } from "./engine";
import { GustySession } from "./session";

const ALL: readonly Direction[] = ["up", "right", "down", "left"];

/** Elige hacia dónde ir: lo que no choque y más acerque a la patita. */
export function chooseBotDirection(state: GameState, config: GustySnakeConfig): Direction {
  let best: Direction = state.direction;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const direction of ALL) {
    if (direction === OPPOSITE[state.direction]) continue;
    const candidate = turn(state, direction) ?? state;
    const next = step(candidate, config);
    if (next.status === "over" && next.overReason !== "full") continue;

    // Comer es lo mejor; si no, acercarse a la patita actual.
    const target = state.food;
    const distance =
      next.score > state.score || target === null
        ? -1
        : Math.abs(next.snake[0].x - target.x) + Math.abs(next.snake[0].y - target.y);
    // A igual distancia se prefiere seguir derecho (menos giros).
    const penalty = direction === state.direction ? 0 : 0.1;
    if (distance + penalty < bestScore) {
      bestScore = distance + penalty;
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
