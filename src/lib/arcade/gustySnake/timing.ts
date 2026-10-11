// La curva de velocidad. Aparte del motor para que la usen también el queso
// (cuánto avanza la cabeza en un tiempo dado) y el dibujo sin importarse en círculo.

import type { GustySnakeConfig } from "./config";

/**
 * Milisegundos entre movimientos para un puntaje dado: arranca en
 * `initialIntervalMs`, baja `intervalStepMs` cada `intervalStepEveryPoints`
 * puntos y nunca pasa de `minIntervalMs`.
 */
export function intervalForScore(score: number, config: GustySnakeConfig): number {
  const steps = Math.floor(score / config.intervalStepEveryPoints);
  return Math.max(config.minIntervalMs, config.initialIntervalMs - steps * config.intervalStepMs);
}
