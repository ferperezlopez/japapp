// Puntos y direcciones de la grilla (puros). Aparte del motor para que lo usen
// también la grilla y el queso sin importarse en círculo; engine.ts los
// vuelve a exportar, así que el resto del código sigue importándolos de ahí.

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
