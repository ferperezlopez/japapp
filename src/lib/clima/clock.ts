// El reloj de los eventos. `events.event_date` guarda la hora tipeada tal cual, sin conversión
// de zona (specs/003-eventos.md): los dígitos son la hora local de Argentina, que está en UTC−3
// todo el año (sin horario de verano desde 2009). Con eso se sabe cuándo «empieza» un evento
// (y el clima queda fijo) y cuántos días faltan; es lo mismo que hace private.event_starts_at
// en la base. Si algún día se hacen eventos en otro huso, esto deja de alcanzar.
//
// DESDE DÓNDE se pronostica ya no está acá: es la ubicación de la sede del evento
// (venues.lat / venues.lng, spec 024), no una ciudad fija.
export const EVENT_CLOCK = {
  timezone: "America/Argentina/Buenos_Aires",
  utcOffsetHours: -3,
} as const;

// Open-Meteo no pronostica más allá de esto (forecast_days = 16 incluye hoy).
export const FORECAST_HORIZON_DAYS = 16;
