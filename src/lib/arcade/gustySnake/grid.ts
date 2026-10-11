// Geometría de la grilla del tablero (pura). Por ahora, una sola cosa: qué
// celdas puede alcanzar la cabeza. La usan la aparición del queso (que nunca
// tiene que cortarle el camino al jugador) y la de la comida.

import type { GustySnakeConfig } from "./config";
import type { Point } from "./directions";

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface Reachable {
  /** 1 en las celdas a las que la cabeza puede llegar (la cabeza misma, no). */
  cells: Uint8Array;
  count: number;
}

/**
 * Celdas a las que puede llegar la cabeza caminando por celdas libres. Es
 * estricto a propósito: TODO el cuerpo cuenta como pared (aunque la cola se
 * va a correr), así que si algo es alcanzable acá, lo es de verdad. Con
 * `extraBlocked` se prueba "¿y si además hubiera algo en esta celda?".
 */
export function reachableFromHead(
  config: GustySnakeConfig,
  snake: readonly Point[],
  extraBlocked: Point | null = null,
): Reachable {
  const { cols, rows } = config;
  const blocked = new Uint8Array(cols * rows);
  for (const segment of snake) blocked[segment.y * cols + segment.x] = 1;
  if (extraBlocked) blocked[extraBlocked.y * cols + extraBlocked.x] = 1;

  const cells = new Uint8Array(cols * rows);
  const queue: number[] = [snake[0].y * cols + snake[0].x];
  let count = 0;

  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % cols;
    const y = Math.floor(queue[i] / cols);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const index = ny * cols + nx;
      if (blocked[index] === 1 || cells[index] === 1) continue;
      cells[index] = 1;
      count++;
      queue.push(index);
    }
  }
  return { cells, count };
}
