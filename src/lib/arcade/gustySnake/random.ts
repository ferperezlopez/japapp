// Generador pseudoaleatorio con semilla del motor. TypeScript puro y sin
// Math.random: el servidor tiene que poder repetir exactamente la misma
// partida a partir de la semilla (ver replay.ts).

/**
 * mulberry32 en forma funcional: dado el estado devuelve un número en [0, 1)
 * y el estado siguiente. Usa solo operaciones enteras de 32 bits
 * (Math.imul y desplazamientos), así que da lo mismo en cualquier motor de JS.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

/** Entero al azar en [min, max], ambos incluidos. */
export function randomInt(
  state: number,
  min: number,
  max: number,
): { value: number; state: number } {
  const random = nextRandom(state);
  return { value: min + Math.floor(random.value * (max - min + 1)), state: random.state };
}
