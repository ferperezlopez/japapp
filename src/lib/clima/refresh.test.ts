import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forecastJson, okResponse } from "./fixtures";
import {
  REFRESH_AFTER_MS,
  daysUntilEvent,
  eventStartInstant,
  getEventWeather,
  shouldRefresh,
} from "./refresh";
import type { WeatherSnapshot } from "./types";

// El evento: 5/11 a las 19:30 hora de Buenos Aires (los dígitos guardados son la hora local).
const EVENT_DATE = "2026-11-05T19:30:00+00:00";
const EVENT_ID = "11111111-2222-4333-8444-555555555555";
// Su hora real de comienzo: 22:30 UTC.
const START = Date.parse("2026-11-05T22:30:00Z");
const HOUR = 60 * 60 * 1000;

const snapshot = (overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  forecastFor: "2026-11-05T19:00",
  temperatureC: 24,
  precipitationProbability: 10,
  precipitationMm: 0,
  windKmh: 12,
  weatherCode: 1,
  fetchedAt: new Date(START - 30 * HOUR).toISOString(),
  ...overrides,
});

describe("eventStartInstant", () => {
  it("lee los dígitos guardados como hora de Buenos Aires (UTC−3)", () => {
    expect(eventStartInstant(EVENT_DATE).toISOString()).toBe("2026-11-05T22:30:00.000Z");
  });
});

describe("daysUntilEvent", () => {
  it("cuenta días de calendario en Buenos Aires, no en UTC", () => {
    // 1/11 22:00 en Buenos Aires ya es 2/11 01:00 UTC.
    expect(daysUntilEvent(EVENT_DATE, new Date("2026-11-02T01:00:00Z"))).toBe(4);
    expect(daysUntilEvent(EVENT_DATE, new Date("2026-11-01T15:00:00Z"))).toBe(4);
  });

  it("el mismo día es 0", () => {
    expect(daysUntilEvent(EVENT_DATE, new Date("2026-11-05T12:00:00Z"))).toBe(0);
  });
});

describe("shouldRefresh", () => {
  const at = (ms: number) => new Date(ms);

  it("sin dato guardado y con el evento en el horizonte: sí", () => {
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START - 2 * 24 * HOUR), snapshot: null })).toBe(true);
  });

  it("un dato reciente y de la misma hora: no", () => {
    const fresh = snapshot({ fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START - HOUR), snapshot: fresh })).toBe(false);
  });

  it("un dato de hace justo el tiempo límite: sí; un minuto antes: no", () => {
    const now = at(START - 10 * HOUR);
    const exactly = snapshot({ fetchedAt: new Date(now.getTime() - REFRESH_AFTER_MS).toISOString() });
    const almost = snapshot({ fetchedAt: new Date(now.getTime() - REFRESH_AFTER_MS + 60_000).toISOString() });
    expect(shouldRefresh({ eventDate: EVENT_DATE, now, snapshot: exactly })).toBe(true);
    expect(shouldRefresh({ eventDate: EVENT_DATE, now, snapshot: almost })).toBe(false);
  });

  it("si se movió la hora del evento, se vuelve a pedir aunque el dato sea reciente", () => {
    const fresh = snapshot({ forecastFor: "2026-11-04T19:00", fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START - HOUR), snapshot: fresh })).toBe(true);
  });

  it("desde la hora de comienzo queda fijo: no se pide más, haya dato o no", () => {
    const old = snapshot();
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START), snapshot: old })).toBe(false);
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START + 5 * HOUR), snapshot: old })).toBe(false);
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START), snapshot: null })).toBe(false);
  });

  it("un minuto antes de que empiece todavía se actualiza", () => {
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: at(START - 60_000), snapshot: snapshot() })).toBe(true);
  });

  it("usa la hora real de comienzo, no los dígitos como UTC: a la tarde del evento todavía no empezó", () => {
    // 19:45 UTC = 16:45 en Buenos Aires, tres horas antes de las 19:30 locales.
    const afternoon = new Date("2026-11-05T19:45:00Z");
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: afternoon, snapshot: snapshot() })).toBe(true);
  });

  it("más lejos del horizonte de Open-Meteo (16 días) no se pide; justo adentro, sí", () => {
    const hoy = new Date("2026-10-21T15:00:00Z"); // BA: 21/10 → el 5/11 está a 15 días
    const antes = new Date("2026-10-20T15:00:00Z"); // 16 días
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: hoy, snapshot: null })).toBe(true);
    expect(shouldRefresh({ eventDate: EVENT_DATE, now: antes, snapshot: null })).toBe(false);
  });
});

// Un supabase de mentira con lo justo: leer la fila del evento y guardarla.
function fakeSupabase({
  row = null,
  selectError = null,
  upsertError = null,
}: {
  row?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
  upsertError?: { message: string } | null;
} = {}) {
  const upserts: [string, Record<string, unknown>, unknown][] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: selectError }) }),
      }),
      upsert: async (payload: Record<string, unknown>, options: unknown) => {
        upserts.push([table, payload, options]);
        return { error: upsertError };
      },
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, upserts };
}

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  forecast_for: "2026-11-05T19:00:00",
  temperature_c: "24.5",
  precipitation_probability: 10,
  precipitation_mm: "0.2",
  wind_kmh: 12,
  weather_code: 1,
  fetched_at: new Date(START - 2 * HOUR).toISOString(),
  ...overrides,
});

describe("getEventWeather", () => {
  const event = { id: EVENT_ID, event_date: EVENT_DATE };
  const apiOk = () => vi.fn().mockResolvedValue(okResponse(forecastJson(["2026-11-05"])));
  const NOW = new Date(START - 10 * HOUR);

  it("sin dato guardado lo pide a Open-Meteo, lo guarda y lo devuelve", async () => {
    const { client, upserts } = fakeSupabase();
    const fetchImpl = apiOk();
    const result = await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      forecastFor: "2026-11-05T19:00",
      temperatureC: 29,
      precipitationProbability: 57,
      precipitationMm: 1.9,
      windKmh: 14.5,
      weatherCode: 3,
      fetchedAt: NOW.toISOString(),
    });
    expect(upserts).toEqual([
      [
        "event_weather",
        {
          event_id: EVENT_ID,
          forecast_for: "2026-11-05T19:00",
          temperature_c: 29,
          precipitation_probability: 57,
          precipitation_mm: 1.9,
          wind_kmh: 14.5,
          weather_code: 3,
          fetched_at: NOW.toISOString(),
        },
        { onConflict: "event_id" },
      ],
    ]);
  });

  it("con un dato reciente lo devuelve tal cual (números y hora normalizados) sin llamar a la API", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - HOUR).toISOString() }) });
    const fetchImpl = apiOk();
    const result = await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
    expect(result).toEqual({
      forecastFor: "2026-11-05T19:00",
      temperatureC: 24.5,
      precipitationProbability: 10,
      precipitationMm: 0.2,
      windKmh: 12,
      weatherCode: 1,
      fetchedAt: new Date(NOW.getTime() - HOUR).toISOString(),
    });
  });

  it("con un dato viejo lo actualiza", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - 5 * HOUR).toISOString() }) });
    const result = await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl: apiOk() } });
    expect(result?.temperatureC).toBe(29);
    expect(upserts).toHaveLength(1);
  });

  it("si la API falla y había un dato viejo, muestra el viejo y no guarda nada", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - 5 * HOUR).toISOString() }) });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    const result = await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } });
    expect(result?.temperatureC).toBe(24.5);
    expect(upserts).toEqual([]);
  });

  it("si la API falla y no había nada, no hay clima", async () => {
    const { client } = fakeSupabase();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("sin red"));
    expect(await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } })).toBeNull();
  });

  it("con el evento ya empezado queda fijo: devuelve lo guardado y no llama a la API", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(START - 20 * HOUR).toISOString() }) });
    const fetchImpl = apiOk();
    const result = await getEventWeather(client, event, { now: new Date(START + HOUR), fetchOptions: { fetchImpl } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
    expect(result?.temperatureC).toBe(24.5);
  });

  it("un evento ya empezado y sin dato guardado no tiene clima", async () => {
    const { client } = fakeSupabase();
    const fetchImpl = apiOk();
    expect(await getEventWeather(client, event, { now: new Date(START + HOUR), fetchOptions: { fetchImpl } })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("un evento más lejos de lo que se pronostica no llama a la API", async () => {
    const { client } = fakeSupabase();
    const fetchImpl = apiOk();
    const farAway = new Date(START - 30 * 24 * HOUR);
    expect(await getEventWeather(client, event, { now: farAway, fetchOptions: { fetchImpl } })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("si no se puede leer la tabla (todavía no existe) no llama a la API ni muestra nada", async () => {
    const { client, upserts } = fakeSupabase({ selectError: { message: 'relation "event_weather" does not exist' } });
    const fetchImpl = apiOk();
    expect(await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("si no se puede guardar, igual muestra lo que se acaba de pedir", async () => {
    const { client } = fakeSupabase({ upsertError: { message: "new row violates row-level security policy" } });
    const result = await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl: apiOk() } });
    expect(result?.temperatureC).toBe(29);
  });

  it("nunca tira: un error inesperado deja al evento sin clima", async () => {
    const client = {
      from: () => {
        throw new Error("explotó");
      },
    } as unknown as SupabaseClient<Database>;
    expect(await getEventWeather(client, event, { now: NOW })).toBeNull();
  });
});
