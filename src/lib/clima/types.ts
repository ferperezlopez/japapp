// El pronóstico guardado para un evento (fila de event_weather, migraciones 0048 y 0050).
export interface WeatherSnapshot {
  /** Hora de pared (sin zona) del lugar consultado: "YYYY-MM-DDTHH:00". */
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
  /**
   * La ubicación con la que se pidió (la de la sede en ese momento). Nulos en los pronósticos
   * guardados antes de la 0050, que se pidieron siempre desde Buenos Aires: no son de ninguna sede.
   */
  lat: number | null;
  lng: number | null;
}

export type ForecastValues = Omit<WeatherSnapshot, "fetchedAt" | "lat" | "lng">;
