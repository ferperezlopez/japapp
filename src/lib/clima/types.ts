// El pronóstico guardado para un evento (fila de event_weather, migración 0048).
export interface WeatherSnapshot {
  /** Hora de pared (sin zona) de la ciudad consultada: "YYYY-MM-DDTHH:00". */
  forecastFor: string;
  temperatureC: number | null;
  /** Probabilidad de precipitación, 0 a 100. */
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  /** Código WMO del cielo (ver weatherCodes.ts). */
  weatherCode: number | null;
  /** Cuándo se pidió a Open-Meteo, ISO. */
  fetchedAt: string;
}

export type ForecastValues = Omit<WeatherSnapshot, "fetchedAt">;
