import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ensureVenueCoordinates } from "@/lib/eventos/venueCoordinates";
import type { Coordinates } from "@/lib/eventos/venueLocation";
import { EVENT_CLOCK, FORECAST_HORIZON_DAYS } from "./clock";
import { eventHourLocal, fetchForecast, type FetchForecastOptions } from "./openMeteo";
import type { WeatherSnapshot } from "./types";

// Un pronóstico guardado se considera viejo a partir de acá.
export const REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = EVENT_CLOCK.utcOffsetHours * HOUR_MS;

// Dos ubicaciones son la misma si difieren menos que esto (unos 1,1 m): lo que se guardó y lo
// que se leyó del link dan el mismo número, esto solo evita comparar decimales de más.
const SAME_PLACE_DEGREES = 1e-5;

/**
 * El instante real en que empieza el evento. `events.event_date` guarda la hora
 * tipeada tal cual, sin conversión de zona: los dígitos son la hora de Argentina
 * (UTC−3). (El resto de la app los lee como si fueran UTC; para el clima se usa la
 * hora real. Es lo mismo que hace private.event_starts_at en la base.)
 */
export function eventStartInstant(eventDate: string): Date {
  return new Date(new Date(eventDate).getTime() - OFFSET_MS);
}

/** Días de calendario (en Argentina) entre hoy y el día del evento. */
export function daysUntilEvent(eventDate: string, now: Date): number {
  const today = new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
  const eventDay = eventDate.slice(0, 10);
  return Math.round((Date.parse(eventDay) - Date.parse(today)) / DAY_MS);
}

/** El evento ya empezó: el clima quedó fijo. */
export function isWeatherFrozen(eventDate: string, now: Date): boolean {
  return now.getTime() >= eventStartInstant(eventDate).getTime();
}

/** ¿El pronóstico guardado se pidió para esta ubicación? (Los de antes de la 0050 no tienen ninguna.) */
export function sameLocation(
  snapshot: Pick<WeatherSnapshot, "lat" | "lng">,
  coordinates: Coordinates,
): boolean {
  return (
    snapshot.lat !== null &&
    snapshot.lng !== null &&
    Math.abs(snapshot.lat - coordinates.lat) < SAME_PLACE_DEGREES &&
    Math.abs(snapshot.lng - coordinates.lng) < SAME_PLACE_DEGREES
  );
}

/** ¿Hay que pedirle el pronóstico a Open-Meteo? */
export function shouldRefresh({
  eventDate,
  now,
  snapshot,
  coordinates,
}: {
  eventDate: string;
  now: Date;
  snapshot: WeatherSnapshot | null;
  /** La ubicación de la sede del evento; sin ella no hay qué pedir. */
  coordinates: Coordinates | null;
}): boolean {
  // Ya empezó: queda fijo (la base tampoco deja escribir).
  if (isWeatherFrozen(eventDate, now)) return false;
  // Sin saber dónde queda la sede no se puede pronosticar.
  if (!coordinates) return false;
  // Todavía más lejos de lo que Open-Meteo pronostica.
  if (daysUntilEvent(eventDate, now) > FORECAST_HORIZON_DAYS - 1) return false;
  if (!snapshot) return true;
  // Se movió la fecha o la hora del evento.
  if (snapshot.forecastFor !== eventHourLocal(eventDate)) return true;
  // Se cambió la sede (o su ubicación), o es un pronóstico de antes de que hubiera ubicaciones.
  if (!sameLocation(snapshot, coordinates)) return true;
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
  lat: number | null;
  lng: number | null;
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
    lat: row.lat,
    lng: row.lng,
  };
}

/** La sede del evento, con lo que hace falta para saber dónde queda. */
export interface WeatherVenue {
  id: string;
  name: string;
  address: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface EventWeather {
  snapshot: WeatherSnapshot | null;
  /**
   * El evento tiene sede y todavía se pronostica, pero no se sabe dónde queda (no tiene link
   * de Google Maps o no se pudo leer): no hay clima que pedir y la pantalla lo avisa.
   */
  needsVenueLocation: boolean;
}

const NO_WEATHER: EventWeather = { snapshot: null, needsVenueLocation: false };

/**
 * El clima de un evento en el lugar donde se hace: el pronóstico por hora de la sede para la hora
 * del evento. Si falta, está viejo, es de otra hora o de otra ubicación, y el evento todavía no
 * empezó, lo pide a Open-Meteo y lo guarda. Nunca muestra el clima de otro lugar: sin sede, o sin
 * saber dónde queda, no hay clima. Una vez que el evento empezó queda fijo. Nunca tira: sin dato
 * (la API no responde, la tabla todavía no existe...) la pantalla simplemente no muestra clima.
 */
export async function getEventWeather(
  supabase: SupabaseClient<Database>,
  event: { id: string; event_date: string },
  {
    venue = null,
    now = new Date(),
    fetchOptions,
    resolveCoordinates,
  }: {
    venue?: WeatherVenue | null;
    now?: Date;
    fetchOptions?: FetchForecastOptions;
    resolveCoordinates?: (address: string) => Promise<Coordinates | null>;
  } = {},
): Promise<EventWeather> {
  try {
    const { data: row, error } = await supabase
      .from("event_weather")
      .select(
        "forecast_for, temperature_c, precipitation_probability, precipitation_mm, wind_kmh, weather_code, fetched_at, lat, lng",
      )
      .eq("event_id", event.id)
      .maybeSingle();
    // Sin poder leer la tabla (por ejemplo, todavía no existe) no se llama a la API
    // en cada visita sin poder guardar el resultado.
    if (error) return NO_WEATHER;

    const stored = row ? snapshotFromRow(row) : null;

    // Ya empezó: queda fijo, tal como se pidió para la sede. Los pronósticos de antes de la
    // 0050 (siempre de Buenos Aires) no son de ninguna sede y no se muestran.
    if (isWeatherFrozen(event.event_date, now)) {
      return { snapshot: stored && stored.lat !== null ? stored : null, needsVenueLocation: false };
    }
    if (!venue) return NO_WEATHER;
    // Más lejos de lo que Open-Meteo pronostica: todavía no hay nada que mostrar ni que pedir.
    if (daysUntilEvent(event.event_date, now) > FORECAST_HORIZON_DAYS - 1) return NO_WEATHER;

    const coordinates = await ensureVenueCoordinates(supabase, venue, {
      now: now.getTime(),
      resolve: resolveCoordinates,
    });
    if (!coordinates) return { snapshot: null, needsVenueLocation: true };

    // Lo guardado solo vale si es de esta hora y de esta ubicación.
    const current =
      stored &&
      stored.forecastFor === eventHourLocal(event.event_date) &&
      sameLocation(stored, coordinates)
        ? stored
        : null;
    if (!shouldRefresh({ eventDate: event.event_date, now, snapshot: stored, coordinates })) {
      return { snapshot: current, needsVenueLocation: false };
    }

    const forecast = await fetchForecast(event.event_date, coordinates, fetchOptions);
    if (!forecast) return { snapshot: current, needsVenueLocation: false };

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
        lat: coordinates.lat,
        lng: coordinates.lng,
      },
      { onConflict: "event_id" },
    );
    return {
      snapshot: { ...forecast, fetchedAt, lat: coordinates.lat, lng: coordinates.lng },
      needsVenueLocation: false,
    };
  } catch {
    return NO_WEATHER;
  }
}
