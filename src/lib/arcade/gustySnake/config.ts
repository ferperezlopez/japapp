// Parámetros de Gusty Glotón (el Snake de JAPArcade). TODO lo que afecta la
// dificultad vive acá, en un único lugar, para poder ajustarla después sin
// tocar el motor.
//
// Este módulo lo importan el navegador (el juego) Y el servidor (que vuelve a
// simular cada partida para validar el puntaje, ver replay.ts): los dos
// tienen que usar exactamente las mismas reglas.
//
// `version`: subirla CADA VEZ que cambie algo que altere el resultado de una
// partida (tamaño del tablero, largo inicial, comidas y puntos, el queso, la
// curva de velocidad, o cualquier regla del motor / colocación de comidas).
// Un replay solo se puede volver a simular con la versión con la que se jugó;
// el servidor rechaza los de otra versión (ver el test de "valores de oro" en
// engine.test.ts, que avisa si algo de esto cambia sin subir la versión).

// El id (y la ruta /arcade/gusty-snake) se mantienen desde que el juego se
// llamaba Gusty Snake: es el `game_id` de los puntajes, así que cambiarlo
// dejaría sin récords a quienes ya jugaron.
export const GUSTY_SNAKE_GAME_ID = "gusty-snake";

export type FoodKind = "olive" | "empanada" | "drumstick";

export interface FoodSpec {
  kind: FoodKind;
  /** Puntos al comerla. */
  points: number;
  /** Segmentos que suma a la serpiente. */
  growth: number;
  /** Peso relativo para sortear cuál aparece: pesos iguales = misma probabilidad. */
  weight: number;
}

/**
 * El queso: no es comida, es un obstáculo mortal. Todos los tiempos son en
 * milisegundos de JUEGO (la suma del intervalo de cada movimiento), no de
 * reloj: así el servidor puede repetir la partida y los tiempos se congelan
 * al pausar (ver engine.ts).
 */
export interface CheeseConfig {
  /** Puntaje desde el cual empieza a aparecer. */
  startScore: number;
  /** Demora entre llegar a `startScore` y la primera aparición: [mín, máx]. */
  firstDelayMs: readonly [number, number];
  /** Cuánto permanece visible: [mín, máx]. */
  lifetimeMs: readonly [number, number];
  /** Pausa entre que desaparece y vuelve a aparecer: [mín, máx]. */
  gapMs: readonly [number, number];
  /** No aparece en la franja recta que la cabeza recorre en este tiempo... */
  safeAheadMs: number;
  /** ...ni a menos de estas celdas (distancia Manhattan) de la cabeza. */
  minHeadDistance: number;
  /** Si no hay ninguna celda válida, vuelve a intentar pasado este tiempo. */
  retryMs: number;
}

export interface GustySnakeConfig {
  version: number;
  /** Columnas y filas del tablero. */
  cols: number;
  rows: number;
  /** Segmentos con los que arranca la serpiente (cabeza incluida). */
  initialLength: number;
  /** Las comidas que pueden aparecer. */
  foods: readonly FoodSpec[];
  cheese: CheeseConfig;
  /** Milisegundos entre movimientos al empezar. */
  initialIntervalMs: number;
  /** Cuántos milisegundos MENOS por movimiento cada `intervalStepEveryPoints`. */
  intervalStepMs: number;
  intervalStepEveryPoints: number;
  /** Velocidad máxima: nunca baja de estos milisegundos por movimiento. */
  minIntervalMs: number;
}

export const GUSTY_SNAKE_CONFIG: GustySnakeConfig = {
  version: 2,
  cols: 18,
  rows: 24,
  initialLength: 3,
  foods: [
    { kind: "olive", points: 5, growth: 1, weight: 1 },
    { kind: "empanada", points: 10, growth: 1, weight: 1 },
    { kind: "drumstick", points: 15, growth: 1, weight: 1 },
  ],
  cheese: {
    startScore: 30,
    firstDelayMs: [1500, 3000],
    lifetimeMs: [4000, 6000],
    gapMs: [8000, 15000],
    safeAheadMs: 900,
    minHeadDistance: 4,
    retryMs: 1000,
  },
  initialIntervalMs: 180,
  intervalStepMs: 5,
  intervalStepEveryPoints: 50,
  minIntervalMs: 90,
};

/** Puntaje máximo posible: la serpiente llena todo el tablero con la comida que más vale. */
export function maxPossibleScore(config: GustySnakeConfig): number {
  const best = Math.max(...config.foods.map((food) => food.points));
  return (config.cols * config.rows - config.initialLength) * best;
}
