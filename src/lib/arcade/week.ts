// Semana de los rankings semanales de JAPArcade: de lunes 00:00 a domingo
// 23:59:59 en hora de Buenos Aires (UTC-3 todo el año: Argentina no usa
// horario de verano).
//
// Quien filtra DE VERDAD es la función SQL arcade_leaderboard()
// (supabase/migrations/0041_arcade_scores.sql), con la misma definición de
// semana. Esto solo calcula el rango para mostrarlo en pantalla, y los tests
// comprueban los mismos bordes que se probaron en la base.

const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante exacto en que empezó la semana actual (lunes 00:00, hora de Buenos Aires). */
export function startOfArcadeWeek(now: Date): Date {
  // Corriendo el reloj -3 h, los getUTC* leen la hora de pared de Buenos Aires
  // sin depender de la zona horaria del servidor.
  const wallClock = new Date(now.getTime() + BUENOS_AIRES_OFFSET_MS);
  const daysSinceMonday = (wallClock.getUTCDay() + 6) % 7;
  const mondayWallClock = Date.UTC(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate() - daysSinceMonday,
  );
  return new Date(mondayWallClock - BUENOS_AIRES_OFFSET_MS);
}

const dayOnly = new Intl.DateTimeFormat("es-AR", { day: "numeric", timeZone: "UTC" });
const dayAndMonth = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "5 al 11 de octubre", o "28 de septiembre al 4 de octubre" si cruza de mes. */
export function formatArcadeWeek(now: Date): string {
  const first = new Date(startOfArcadeWeek(now).getTime() + BUENOS_AIRES_OFFSET_MS);
  const last = new Date(first.getTime() + 6 * DAY_MS);
  return first.getUTCMonth() === last.getUTCMonth()
    ? `${dayOnly.format(first)} al ${dayAndMonth.format(last)}`
    : `${dayAndMonth.format(first)} al ${dayAndMonth.format(last)}`;
}
