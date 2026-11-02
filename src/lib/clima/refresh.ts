import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { EVENT_WEATHER_LOCATION, FORECAST_HORIZON_DAYS } from "./location";
import { eventHourLocal, fetchForecast, type FetchForecastOptions } from "./openMeteo";
import type { WeatherSnapshot } from "./types";

// Un pronóstico guardado se considera viejo a partir de acá.
export const REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = EVENT_WEATHER_LOCATION.utcOffsetHours * HOUR_MS;

/**
 * El instante real en que empieza el evento. `events.event_date` guarda la hora
 * tipeada tal cual, sin conversión de zona: los dígitos son la hora de Buenos
 * Aires. (El resto de la app los lee como si fueran UTC; para el clima se usa la
 * hora real. Es lo mismo que hace private.event_starts_at en la base.)
 */
export function eventStartInstant(eventDate: string): Date {
  return new Date(new Date(eventDate).getTime() - OFFSET_MS);
}

/** Días de calendario (en la ciudad) entre hoy y el día del evento. */
export function daysUntilEvent(eventDate: string, now: Date): number {
  const today = new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
  const eventDay = eventDate.slice(0, 10);
  return Math.round((Date.parse(eventDay) - Date.parse(today)) / DAY_MS);
}

/** El evento ya empezó: el clima quedó fijo. */
export function isWeatherFrozen(eventDate: string, now: Date): boolean {
  return now.getTime() >= eventStartInstant(eventDate).getTime();
}

/** ¿Hay que pedirle el pronóstico a Open-Meteo? */
export function shouldRefresh({
  eventDate,
  now,
  snapshot,
}: {
  eventDate: string;
  now: Date;
  snapshot: WeatherSnapshot | null;
}): boolean {
  // Ya empezó: queda fijo (la base tampoco deja escribir).
  if (isWeatherFrozen(eventDate, now)) return false;
  // Todavía más lejos de lo que Open-Meteo pronostica.
  if (daysUntilEvent(eventDate, now) > FORECAST_HORIZON_DAYS - 1) return false;
  if (!snapshot) return true;
  // Se movió la fecha o la hora del evento.
  if (snapshot.forecastFor !== eventHourLocal(eventDate)) return true;
  return now.getTime() - new Date(snapshot.fetchedAt).getTime() >= REFRESH_AFTER_MS;
}

type WeatherRow = {
  forecast_for: string;
  temperature_c: number | string | null;
  precipitation_probability: number | null;
  precipitation_mm: number | string | null;
  wind_kmh: number | string | null;
  weather_code: number | null;
  fetched_at: string;
};

const toNumber = (value: number | string | null) => (value === null ? null : Number(value));

function snapshotFromRow(row: WeatherRow): WeatherSnapshot {
  return {
    // La base devuelve "YYYY-MM-DDTHH:MM:SS": se deja en "YYYY-MM-DDTHH:MM".
    forecastFor: row.forecast_for.slice(0, 16),
    temperatureC: toNumber(row.temperature_c),
    precipitationProbability: row.precipitation_probability,
    precipitationMm: toNumber(row.precipitation_mm),
    windKmh: toNumber(row.wind_kmh),
    weatherCode: row.weather_code,
    fetchedAt: row.fetched_at,
  };
}

/**
 * El clima guardado de un evento; si falta o está viejo y el evento todavía no
 * empezó, lo pide a Open-Meteo y lo guarda. Nunca tira: sin dato (la API no
 * responde, la tabla todavía no existe...) devuelve lo último que había o null,
 * y la pantalla simplemente no muestra clima.
 */
export async function getEventWeather(
  supabase: SupabaseClient<Database>,
  event: { id: string; event_date: string },
  { now = new Date(), fetchOptions }: { now?: Date; fetchOptions?: FetchForecastOptions } = {},
): Promise<WeatherSnapshot | null> {
  try {
    const { data: row, error } = await supabase
      .from("event_weather")
      .select(
        "forecast_for, temperature_c, precipitation_probability, precipitation_mm, wind_kmh, weather_code, fetched_at",
      )
      .eq("event_id", event.id)
      .maybeSingle();
    // Sin poder leer la tabla (por ejemplo, todavía no existe) no se llama a la API
    // en cada visita sin poder guardar el resultado.
    if (error) return null;

    const snapshot = row ? snapshotFromRow(row) : null;
    if (!shouldRefresh({ eventDate: event.event_date, now, snapshot })) return snapshot;

    const forecast = await fetchForecast(event.event_date, fetchOptions);
    if (!forecast) return snapshot;

    const fetchedAt = now.toISOString();
    // Si no se puede guardar (por ejemplo, el evento empezó justo ahora y la base ya
    // no deja), igual se muestra lo que se acaba de pedir.
    await supabase.from("event_weather").upsert(
      {
        event_id: event.id,
        forecast_for: forecast.forecastFor,
        temperature_c: forecast.temperatureC,
        precipitation_probability: forecast.precipitationProbability,
        precipitation_mm: forecast.precipitationMm,
        wind_kmh: forecast.windKmh,
        weather_code: forecast.weatherCode,
        fetched_at: fetchedAt,
      },
      { onConflict: "event_id" },
    );
    return { ...forecast, fetchedAt };
  } catch {
    return null;
  }
}
