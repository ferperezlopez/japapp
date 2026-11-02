// Desde dónde se pronostica el clima de los eventos. Los lugares no tienen
// coordenadas (la 0021 las reemplazó por una dirección de texto), así que todos
// los eventos usan la misma ciudad: el grupo se junta en el Gran Buenos Aires y
// el pronóstico de la ciudad alcanza para saber si llueve y qué temperatura hace.
// Si se juntan en otra, se cambia acá y listo.
export const EVENT_WEATHER_LOCATION = {
  name: "Buenos Aires",
  latitude: -34.61,
  longitude: -58.38,
  timezone: "America/Argentina/Buenos_Aires",
  // Buenos Aires está en UTC−3 todo el año (sin horario de verano desde 2009). Si se
  // cambia la ciudad por una con horario de verano, esto deja de alcanzar.
  utcOffsetHours: -3,
} as const;

// Open-Meteo no pronostica más allá de esto (forecast_days = 16 incluye hoy).
export const FORECAST_HORIZON_DAYS = 16;
