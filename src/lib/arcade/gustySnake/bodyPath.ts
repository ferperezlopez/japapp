// Geometría visual del cuerpo de la serpiente (pura, sin canvas). El motor
// avanza a saltos de una celda; para que se vea continuo, el cuerpo se dibuja
// como UN trazado que pasa por el centro de las celdas, con la cabeza y la cola
// a mitad de camino entre el estado anterior y el actual.
//
// Es solo presentación: el motor no sabe que esto existe y las colisiones se
// siguen decidiendo en la grilla.

import type { GameState, Point } from "./engine";

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Puntos (en celdas, con decimales) por los que pasa el cuerpo, de la cabeza a
 * la cola, `progress` (0–1) del camino entre `previous` y `state`.
 *
 * La cabeza avanza hacia su celda nueva y la cola hacia la suya; el resto son
 * las celdas del estado actual. Cuando la serpiente crece, la cola no se
 * mueve (su celda vieja y la nueva son la misma), así que el cuerpo se alarga
 * en vez de desplazarse. Nunca hay dos puntos seguidos iguales.
 */
export function bodyPoints(previous: GameState, state: GameState, progress: number): Point[] {
  const t = Math.min(1, Math.max(0, progress));
  const head = lerp(previous.snake[0], state.snake[0], t);
  const tail = lerp(
    previous.snake[previous.snake.length - 1],
    state.snake[state.snake.length - 1],
    t,
  );
  const points = [head, ...state.snake.slice(1), tail];

  const clean: Point[] = [];
  for (const point of points) {
    const last = clean[clean.length - 1];
    if (!last || Math.abs(last.x - point.x) > 1e-9 || Math.abs(last.y - point.y) > 1e-9) {
      clean.push(point);
    }
  }
  return clean;
}
