// Respuesta de Open-Meteo de mentira para las pruebas (la API real no se alcanza
// desde el entorno de desarrollo): la forma documentada de `hourly`, con las horas
// de pared de la ciudad. Solo la usan los tests.
export function forecastJson(
  days: string[],
  value: (day: string, hour: number) => Partial<Record<string, number | null>> = (_day, hour) => ({
    temperature_2m: 10 + hour,
    precipitation_probability: hour * 3,
    precipitation: hour / 10,
    weather_code: hour < 12 ? 0 : 3,
    wind_speed_10m: 5 + hour / 2,
  }),
) {
  const keys = [
    "temperature_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
  ];
  const hourly: Record<string, unknown[]> = { time: [] };
  for (const key of keys) hourly[key] = [];
  for (const day of days) {
    for (let hour = 0; hour < 24; hour++) {
      hourly.time.push(`${day}T${String(hour).padStart(2, "0")}:00`);
      const values = value(day, hour);
      for (const key of keys) hourly[key].push(values[key] ?? null);
    }
  }
  return { latitude: -34.61, longitude: -58.38, timezone: "America/Argentina/Buenos_Aires", hourly };
}

export function okResponse(json: unknown): Response {
  return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
}
