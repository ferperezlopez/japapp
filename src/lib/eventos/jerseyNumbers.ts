// Dorsal puramente visual (no se guarda en la base, ver
// specs/015-armar-equipos-futbol.md): numera arquero=1 y sigue
// correlativo con defensores y delanteros, en el orden en que vienen los
// grupos. No reproduce los "saltos" de una camiseta real (arquero=1,
// defensores=4-5, delanteros=9-11) — es solo para poder distinguir a cada
// jugador de un vistazo en la cancha, así que un esquema secuencial simple
// alcanza. Cada equipo se numera de forma independiente (llamar una vez
// por equipo).
export function assignJerseyNumbers(
  groups: { userId: string }[][],
): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const group of groups) {
    for (const player of group) {
      numbers.set(player.userId, next);
      next++;
    }
  }
  return numbers;
}
