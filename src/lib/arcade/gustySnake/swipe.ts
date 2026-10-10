// Lógica pura de los deslizamientos (swipes) para girar la serpiente. Sin DOM:
// input.ts solo le pasa las coordenadas del dedo. Separado para poder probar
// que los gestos se interpretan bien sin un celular.

import type { Direction } from "./engine";

/**
 * Cuántos píxeles tiene que recorrer el dedo para que cuente como un giro.
 * Lo bastante chico para sentirse inmediato (a 90–180 ms por movimiento no se
 * puede esperar a un gesto largo) y lo bastante grande para ignorar el
 * temblor de un dedo apoyado.
 */
export const SWIPE_THRESHOLD_PX = 20;

/** Dirección de un desplazamiento (dx, dy), o null si fue demasiado corto. */
export function directionFromDelta(
  dx: number,
  dy: number,
  threshold: number = SWIPE_THRESHOLD_PX,
): Direction | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (!(Math.max(absX, absY) >= threshold)) return null; // también descarta NaN
  if (absX > absY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up"; // en un empate manda el eje vertical
}

/**
 * Sigue UN dedo apoyado. Es continuo: cada vez que reconoce un giro vuelve a
 * tomar como origen el punto actual, así que varios giros dentro de un mismo
 * gesto (arriba y enseguida izquierda, sin levantar el dedo) se reconocen
 * todos, en vez de perderse hasta el próximo toque.
 */
export class SwipeTracker {
  private originX = 0;
  private originY = 0;
  private active = false;

  constructor(private readonly threshold: number = SWIPE_THRESHOLD_PX) {}

  start(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.active = true;
  }

  /** Nueva posición del dedo: devuelve el giro reconocido, si hubo uno. */
  move(x: number, y: number): Direction | null {
    if (!this.active) return null;
    const direction = directionFromDelta(x - this.originX, y - this.originY, this.threshold);
    if (direction) {
      this.originX = x;
      this.originY = y;
    }
    return direction;
  }

  end(): void {
    this.active = false;
  }
}
