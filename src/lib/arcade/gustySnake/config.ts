// Parámetros de Gusty Snake. TODO lo que afecta la dificultad vive acá, en un
// único lugar, para poder ajustarla después sin tocar el motor.
//
// Este módulo lo importan el navegador (el juego) Y el servidor (que vuelve a
// simular cada partida para validar el puntaje, ver replay.ts): los dos
// tienen que usar exactamente las mismas reglas.
//
// `version`: subirla CADA VEZ que cambie algo que altere el resultado de una
// partida (tamaño del tablero, largo inicial, puntos por patita, curva de
// velocidad, o cualquier regla del motor / colocación de patitas). Un replay
// solo se puede volver a simular con la versión con la que se jugó; el
// servidor rechaza los de otra versión (ver el test de "valores de oro" en
// engine.test.ts, que avisa si algo de esto cambia sin subir la versión).

export const GUSTY_SNAKE_GAME_ID = "gusty-snake";

export interface GustySnakeConfig {
  version: number;
  /** Columnas y filas del tablero. */
  cols: number;
  rows: number;
  /** Segmentos con los que arranca la serpiente (cabeza incluida). */
  initialLength: number;
  /** Puntos por cada patita de pollo. */
  pointsPerFood: number;
  /** Milisegundos entre movimientos al empezar. */
  initialIntervalMs: number;
  /** Cuántos milisegundos MENOS por movimiento cada `intervalStepEveryPoints`. */
  intervalStepMs: number;
  intervalStepEveryPoints: number;
  /** Velocidad máxima: nunca baja de estos milisegundos por movimiento. */
  minIntervalMs: number;
}

export const GUSTY_SNAKE_CONFIG: GustySnakeConfig = {
  version: 1,
  cols: 18,
  rows: 24,
  initialLength: 3,
  pointsPerFood: 10,
  initialIntervalMs: 180,
  intervalStepMs: 5,
  intervalStepEveryPoints: 50,
  minIntervalMs: 90,
};

/** Puntaje máximo posible: la serpiente llena todo el tablero. */
export function maxPossibleScore(config: GustySnakeConfig): number {
  return (config.cols * config.rows - config.initialLength) * config.pointsPerFood;
}
