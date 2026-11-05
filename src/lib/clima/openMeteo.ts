import type { Coordinates } from "@/lib/eventos/venueLocation";
import { FORECAST_HORIZON_DAYS } from "./clock";
import type { ForecastValues } from "./types";

// Cliente mínimo del pronóstico por hora de Open-Meteo (gratis, sin clave).
// https://open-meteo.com/en/docs — los datos se licencian CC BY 4.0: la pantalla
// muestra «Open-Meteo.com» (ver WeatherLine).
//
// La URL base se puede cambiar con OPEN_METEO_URL, solo para probar contra un
// servidor falso (desde el entorno de desarrollo no se llega a la API real).
const DEFAULT_BASE_URL = "https://api.open-meteo.com";

export const HOURLY_VARIABLES = [
  "temperature_2m",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
] as const;

/**
 * La URL del pronóstico por hora para una ubicación (la de la sede del evento). Con
 * `timezone=auto` las horas de la respuesta son las de pared del lugar, que es en lo que
 * está la hora del evento: así «las 19:00» es siempre las 19:00 de ahí.
 */
export function buildForecastUrl(
  { lat, lng }: Coordinates,
  baseUrl: string = DEFAULT_BASE_URL,
): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: HOURLY_VARIABLES.join(","),
    timezone: "auto",
    forecast_days: String(FORECAST_HORIZON_DAYS),
    wind_speed_unit: "kmh",
  });
  return `${baseUrl.replace(/\/$/, "")}/v1/forecast?${params.toString()}`;
}

/**
 * La hora de pared del evento, "YYYY-MM-DDTHH:00". `events.event_date` guarda lo que
 * se tipeó tal cual, sin conversión de zona (specs/003-eventos.md), así que los
 * dígitos del ISO ya son la hora local: se cortan, sin pasar por `Date`.
 */
export function eventHourLocal(eventDate: string): string {
  return `${eventDate.slice(0, 13)}:00`;
}

type HourlyJson = {
  time?: unknown;
  temperature_2m?: unknown;
  precipitation_probability?: unknown;
  precipitation?: unknown;
  weather_code?: unknown;
  wind_speed_10m?: unknown;
};

function numberAt(series: unknown, index: number): number | null {
  if (!Array.isArray(series)) return null;
  const value = series[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Los valores de la hora pedida dentro de la respuesta de Open-Meteo, o null si la
 * respuesta no tiene esa hora (o no tiene la forma esperada).
 */
export function parseForecast(json: unknown, hour: string): ForecastValues | null {
  const hourly = (json as { hourly?: HourlyJson } | null)?.hourly;
  if (!hourly || !Array.isArray(hourly.time)) return null;
  const index = hourly.time.indexOf(hour);
  if (index === -1) return null;

  const temperature = numberAt(hourly.temperature_2m, index);
  const probability = numberAt(hourly.precipitation_probability, index);
  const code = numberAt(hourly.weather_code, index);
  // Sin ningún dato útil no vale la pena guardar nada.
  if (temperature === null && probability === null && code === null) return null;

  return {
    forecastFor: hour,
    temperatureC: temperature,
    precipitationProbability: probability === null ? null : Math.round(probability),
    precipitationMm: numberAt(hourly.precipitation, index),
    windKmh: numberAt(hourly.wind_speed_10m, index),
    weatherCode: code === null ? null : Math.round(code),
  };
}

export interface FetchForecastOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Pide el pronóstico del lugar y devuelve los valores para la hora del evento. Devuelve
 * null si la API no responde bien, tarda demasiado o no trae esa hora: el clima es un
 * agregado, nunca tiene que romper la pantalla del evento.
 */
export async function fetchForecast(
  eventDate: string,
  coordinates: Coordinates,
  {
    fetchImpl = fetch,
    baseUrl = process.env.OPEN_METEO_URL || DEFAULT_BASE_URL,
    timeoutMs = 2500,
  }: FetchForecastOptions = {},
): Promise<ForecastValues | null> {
  try {
    const response = await fetchImpl(buildForecastUrl(coordinates, baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return parseForecast(await response.json(), eventHourLocal(eventDate));
  } catch {
    return null;
  }
}
