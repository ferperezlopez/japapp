import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { RETRY_AFTER_MS, resetVenueCoordinatesMemory } from "@/lib/eventos/venueCoordinates";
import { forecastJson, okResponse } from "./fixtures";
import {
  REFRESH_AFTER_MS,
  daysUntilEvent,
  eventStartInstant,
  getEventWeather,
  sameLocation,
  shouldRefresh,
  type WeatherVenue,
} from "./refresh";
import type { WeatherSnapshot } from "./types";

// El evento: 5/11 a las 19:30 hora de Buenos Aires (los dígitos guardados son la hora local).
const EVENT_DATE = "2026-11-05T19:30:00+00:00";
const EVENT_ID = "11111111-2222-4333-8444-555555555555";
// Su hora real de comienzo: 22:30 UTC.
const START = Date.parse("2026-11-05T22:30:00Z");
const HOUR = 60 * 60 * 1000;

// Dos lugares distintos: la sede del evento y otra (Córdoba).
const SEDE = { lat: -34.5612, lng: -58.4564 };
const OTRA = { lat: -31.4201, lng: -64.1888 };

const snapshot = (overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  forecastFor: "2026-11-05T19:00",
  temperatureC: 24,
  precipitationProbability: 10,
  precipitationMm: 0,
  windKmh: 12,
  weatherCode: 1,
  fetchedAt: new Date(START - 30 * HOUR).toISOString(),
  lat: SEDE.lat,
  lng: SEDE.lng,
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

describe("sameLocation", () => {
  it("la misma ubicación (con una tolerancia de un metro, no más)", () => {
    expect(sameLocation({ lat: SEDE.lat, lng: SEDE.lng }, SEDE)).toBe(true);
    expect(sameLocation({ lat: SEDE.lat + 0.000009, lng: SEDE.lng - 0.000009 }, SEDE)).toBe(true);
    expect(sameLocation({ lat: SEDE.lat + 0.00002, lng: SEDE.lng }, SEDE)).toBe(false);
    expect(sameLocation({ lat: SEDE.lat, lng: SEDE.lng - 0.00002 }, SEDE)).toBe(false);
  });

  it("otra ubicación no", () => {
    expect(sameLocation({ lat: OTRA.lat, lng: OTRA.lng }, SEDE)).toBe(false);
  });

  it("un pronóstico sin ubicación (de antes de la 0050) no es de ninguna sede", () => {
    expect(sameLocation({ lat: null, lng: null }, SEDE)).toBe(false);
    expect(sameLocation({ lat: SEDE.lat, lng: null }, SEDE)).toBe(false);
    expect(sameLocation({ lat: null, lng: SEDE.lng }, SEDE)).toBe(false);
    // «Sin ubicación» no es la latitud 0, longitud 0.
    expect(sameLocation({ lat: null, lng: null }, { lat: 0, lng: 0 })).toBe(false);
  });
});

describe("shouldRefresh", () => {
  const at = (ms: number) => new Date(ms);
  const base = { eventDate: EVENT_DATE, coordinates: SEDE };

  it("sin dato guardado y con el evento en el horizonte: sí", () => {
    expect(shouldRefresh({ ...base, now: at(START - 2 * 24 * HOUR), snapshot: null })).toBe(true);
  });

  it("un dato reciente, de la misma hora y de la misma sede: no", () => {
    const fresh = snapshot({ fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ ...base, now: at(START - HOUR), snapshot: fresh })).toBe(false);
  });

  it("un dato de hace justo el tiempo límite: sí; un minuto antes: no", () => {
    const now = at(START - 10 * HOUR);
    const exactly = snapshot({ fetchedAt: new Date(now.getTime() - REFRESH_AFTER_MS).toISOString() });
    const almost = snapshot({ fetchedAt: new Date(now.getTime() - REFRESH_AFTER_MS + 60_000).toISOString() });
    expect(shouldRefresh({ ...base, now, snapshot: exactly })).toBe(true);
    expect(shouldRefresh({ ...base, now, snapshot: almost })).toBe(false);
  });

  it("el límite son 3 horas: a las 2 h 59 min no se vuelve a pedir, a las 3 h sí", () => {
    const now = at(START - 10 * HOUR);
    const hace = (minutes: number) => snapshot({ fetchedAt: new Date(now.getTime() - minutes * 60_000).toISOString() });
    expect(REFRESH_AFTER_MS).toBe(3 * HOUR);
    expect(shouldRefresh({ ...base, now, snapshot: hace(179) })).toBe(false);
    expect(shouldRefresh({ ...base, now, snapshot: hace(180) })).toBe(true);
  });

  it("si se movió la hora del evento, se vuelve a pedir aunque el dato sea reciente", () => {
    const fresh = snapshot({ forecastFor: "2026-11-04T19:00", fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ ...base, now: at(START - HOUR), snapshot: fresh })).toBe(true);
  });

  it("si se cambió la sede o su ubicación, se vuelve a pedir aunque el dato sea reciente", () => {
    const fresh = snapshot({ lat: OTRA.lat, lng: OTRA.lng, fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ ...base, now: at(START - HOUR), snapshot: fresh })).toBe(true);
  });

  it("un pronóstico de antes de la 0050 (sin ubicación) se vuelve a pedir aunque sea reciente", () => {
    const legacy = snapshot({ lat: null, lng: null, fetchedAt: at(START - 2 * HOUR).toISOString() });
    expect(shouldRefresh({ ...base, now: at(START - HOUR), snapshot: legacy })).toBe(true);
  });

  it("sin saber dónde queda la sede no hay qué pedir", () => {
    expect(shouldRefresh({ ...base, coordinates: null, now: at(START - 2 * 24 * HOUR), snapshot: null })).toBe(false);
    expect(shouldRefresh({ ...base, coordinates: null, now: at(START - 2 * 24 * HOUR), snapshot: snapshot() })).toBe(false);
  });

  it("desde la hora de comienzo queda fijo: no se pide más, haya dato o no", () => {
    const old = snapshot();
    expect(shouldRefresh({ ...base, now: at(START), snapshot: old })).toBe(false);
    expect(shouldRefresh({ ...base, now: at(START + 5 * HOUR), snapshot: old })).toBe(false);
    expect(shouldRefresh({ ...base, now: at(START), snapshot: null })).toBe(false);
  });

  it("un minuto antes de que empiece todavía se actualiza", () => {
    expect(shouldRefresh({ ...base, now: at(START - 60_000), snapshot: snapshot() })).toBe(true);
  });

  it("usa la hora real de comienzo, no los dígitos como UTC: a la tarde del evento todavía no empezó", () => {
    // 19:45 UTC = 16:45 en Buenos Aires, tres horas antes de las 19:30 locales.
    const afternoon = new Date("2026-11-05T19:45:00Z");
    expect(shouldRefresh({ ...base, now: afternoon, snapshot: snapshot() })).toBe(true);
  });

  it("más lejos del horizonte de Open-Meteo (16 días) no se pide; justo adentro, sí", () => {
    const hoy = new Date("2026-10-21T15:00:00Z"); // BA: 21/10 → el 5/11 está a 15 días
    const antes = new Date("2026-10-20T15:00:00Z"); // 16 días
    expect(shouldRefresh({ ...base, now: hoy, snapshot: null })).toBe(true);
    expect(shouldRefresh({ ...base, now: antes, snapshot: null })).toBe(false);
  });
});

// Un supabase de mentira con lo justo: leer la fila del evento, guardarla y llamar a una función.
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
  const rpcs: [string, Record<string, unknown>][] = [];
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push([name, args]);
      return { error: null };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, upserts, rpcs };
}

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  forecast_for: "2026-11-05T19:00:00",
  temperature_c: "24.5",
  precipitation_probability: 10,
  precipitation_mm: "0.2",
  wind_kmh: 12,
  weather_code: 1,
  fetched_at: new Date(START - 2 * HOUR).toISOString(),
  lat: SEDE.lat,
  lng: SEDE.lng,
  ...overrides,
});

const venue = (overrides: Partial<WeatherVenue> = {}): WeatherVenue => ({
  id: "v-javis",
  name: "Javi's",
  address: "https://maps.app.goo.gl/g45UqHpc6iVv8Ng67",
  lat: SEDE.lat,
  lng: SEDE.lng,
  ...overrides,
});

describe("getEventWeather", () => {
  const event = { id: EVENT_ID, event_date: EVENT_DATE };
  const apiOk = () => vi.fn().mockResolvedValue(okResponse(forecastJson(["2026-11-05"])));
  const NOW = new Date(START - 10 * HOUR);
  const SIN_CLIMA = { snapshot: null, needsVenueLocation: false };

  beforeEach(() => {
    resetVenueCoordinatesMemory();
  });

  it("sin dato guardado lo pide a Open-Meteo para la ubicación de la sede, lo guarda con ella y lo devuelve", async () => {
    const { client, upserts } = fakeSupabase();
    const fetchImpl = apiOk();
    const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as [string];
    const params = new URL(url).searchParams;
    expect(params.get("latitude")).toBe(String(SEDE.lat));
    expect(params.get("longitude")).toBe(String(SEDE.lng));
    expect(params.get("timezone")).toBe("auto");

    expect(result).toEqual({
      snapshot: {
        forecastFor: "2026-11-05T19:00",
        temperatureC: 29,
        precipitationProbability: 57,
        precipitationMm: 1.9,
        windKmh: 14.5,
        weatherCode: 3,
        fetchedAt: NOW.toISOString(),
        lat: SEDE.lat,
        lng: SEDE.lng,
      },
      needsVenueLocation: false,
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
          lat: SEDE.lat,
          lng: SEDE.lng,
        },
        { onConflict: "event_id" },
      ],
    ]);
  });

  it("con un dato reciente, de la misma hora y la misma sede, lo devuelve tal cual (números y hora normalizados) sin llamar a la API", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - HOUR).toISOString() }) });
    const fetchImpl = apiOk();
    const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
    expect(result).toEqual({
      snapshot: {
        forecastFor: "2026-11-05T19:00",
        temperatureC: 24.5,
        precipitationProbability: 10,
        precipitationMm: 0.2,
        windKmh: 12,
        weatherCode: 1,
        fetchedAt: new Date(NOW.getTime() - HOUR).toISOString(),
        lat: SEDE.lat,
        lng: SEDE.lng,
      },
      needsVenueLocation: false,
    });
  });

  it("con un dato viejo (de la misma sede) lo actualiza", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - 5 * HOUR).toISOString() }) });
    const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl: apiOk() } });
    expect(result.snapshot?.temperatureC).toBe(29);
    expect(upserts).toHaveLength(1);
  });

  describe("el clima es el de la sede", () => {
    it("si se cambió la sede por una en otro lugar, se vuelve a pedir aunque el dato sea reciente, y se guarda con la nueva ubicación", async () => {
      const { client, upserts } = fakeSupabase({
        row: storedRow({ fetched_at: new Date(NOW.getTime() - HOUR).toISOString(), lat: OTRA.lat, lng: OTRA.lng }),
      });
      const fetchImpl = apiOk();
      const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.snapshot?.temperatureC).toBe(29);
      expect(result.snapshot).toMatchObject({ lat: SEDE.lat, lng: SEDE.lng });
      expect(upserts[0][1]).toMatchObject({ lat: SEDE.lat, lng: SEDE.lng });
    });

    it("el pronóstico de Buenos Aires de antes de la 0050 (sin ubicación) no se muestra como si fuera de la sede: se vuelve a pedir", async () => {
      const { client, upserts } = fakeSupabase({
        row: storedRow({ fetched_at: new Date(NOW.getTime() - HOUR).toISOString(), lat: null, lng: null }),
      });
      const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl: apiOk() } });
      expect(result.snapshot).toMatchObject({ temperatureC: 29, lat: SEDE.lat, lng: SEDE.lng });
      expect(upserts).toHaveLength(1);
    });

    it("…y si la API falla, no se muestra el clima de otro lugar", async () => {
      const legacy = fakeSupabase({ row: storedRow({ lat: null, lng: null }) });
      const otraSede = fakeSupabase({ row: storedRow({ lat: OTRA.lat, lng: OTRA.lng }) });
      const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
      expect(await getEventWeather(legacy.client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
      expect(await getEventWeather(otraSede.client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
    });

    it("…ni el de otra hora (se movió el evento) si la API falla", async () => {
      const { client } = fakeSupabase({ row: storedRow({ forecast_for: "2026-11-04T19:00:00" }) });
      const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
      expect(await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
    });

    it("un evento sin sede no tiene clima, haya lo que haya guardado", async () => {
      const { client, upserts } = fakeSupabase({ row: storedRow() });
      const fetchImpl = apiOk();
      expect(await getEventWeather(client, event, { venue: null, now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
      expect(await getEventWeather(client, event, { now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(upserts).toEqual([]);
    });

    it("una sede sin link ni ubicación no tiene clima: no se pide nada y se avisa que falta la ubicación", async () => {
      const { client, upserts, rpcs } = fakeSupabase({ row: storedRow() });
      const fetchImpl = apiOk();
      const resolveCoordinates = vi.fn();
      const result = await getEventWeather(client, event, {
        venue: venue({ address: null, lat: null, lng: null }),
        now: NOW,
        fetchOptions: { fetchImpl },
        resolveCoordinates,
      });
      expect(result).toEqual({ snapshot: null, needsVenueLocation: true });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(resolveCoordinates).not.toHaveBeenCalled();
      expect(upserts).toEqual([]);
      expect(rpcs).toEqual([]);
    });

    it("una sede con link pero sin ubicación guardada (anterior a la 0050) se lee del link, se guarda y se pide el clima ahí", async () => {
      const { client, upserts, rpcs } = fakeSupabase();
      const fetchImpl = apiOk();
      const resolveCoordinates = vi.fn().mockResolvedValue(SEDE);
      const result = await getEventWeather(client, event, {
        venue: venue({ lat: null, lng: null }),
        now: NOW,
        fetchOptions: { fetchImpl },
        resolveCoordinates,
      });

      expect(resolveCoordinates).toHaveBeenCalledWith("https://maps.app.goo.gl/g45UqHpc6iVv8Ng67");
      expect(rpcs).toEqual([["set_venue_coordinates", { p_venue_id: "v-javis", p_lat: SEDE.lat, p_lng: SEDE.lng }]]);
      const params = new URL((fetchImpl.mock.calls[0] as [string])[0]).searchParams;
      expect(params.get("latitude")).toBe(String(SEDE.lat));
      expect(result.snapshot).toMatchObject({ temperatureC: 29, lat: SEDE.lat, lng: SEDE.lng });
      expect(upserts[0][1]).toMatchObject({ lat: SEDE.lat, lng: SEDE.lng });
    });

    it("un link que no se puede leer: no hay clima, se avisa, y no se vuelve a intentar en cada visita", async () => {
      const { client, rpcs } = fakeSupabase();
      const fetchImpl = apiOk();
      const resolveCoordinates = vi.fn().mockResolvedValue(null);
      const options = { venue: venue({ lat: null, lng: null }), now: NOW, fetchOptions: { fetchImpl }, resolveCoordinates };

      expect(await getEventWeather(client, event, options)).toEqual({ snapshot: null, needsVenueLocation: true });
      expect(await getEventWeather(client, event, options)).toEqual({ snapshot: null, needsVenueLocation: true });
      expect(resolveCoordinates).toHaveBeenCalledTimes(1);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(rpcs).toEqual([]);
    });
  });

  it("si la API falla y había un dato viejo del mismo lugar, muestra el viejo y no guarda nada", async () => {
    const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(NOW.getTime() - 5 * HOUR).toISOString() }) });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } });
    expect(result.snapshot?.temperatureC).toBe(24.5);
    expect(upserts).toEqual([]);
  });

  it("si la API falla y no había nada, no hay clima (y no es por falta de ubicación)", async () => {
    const { client } = fakeSupabase();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("sin red"));
    expect(await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
  });

  describe("el evento ya empezó: queda fijo", () => {
    const after = new Date(START + HOUR);

    it("devuelve lo guardado para la sede y no llama a la API", async () => {
      const { client, upserts } = fakeSupabase({ row: storedRow({ fetched_at: new Date(START - 20 * HOUR).toISOString() }) });
      const fetchImpl = apiOk();
      const result = await getEventWeather(client, event, { venue: venue(), now: after, fetchOptions: { fetchImpl } });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(upserts).toEqual([]);
      expect(result.snapshot?.temperatureC).toBe(24.5);
      expect(result.needsVenueLocation).toBe(false);
    });

    it("se muestra aunque después se haya cambiado la ubicación de la sede (es lo que se pronosticó entonces)", async () => {
      const { client } = fakeSupabase({ row: storedRow({ lat: OTRA.lat, lng: OTRA.lng }) });
      const result = await getEventWeather(client, event, { venue: venue(), now: after, fetchOptions: { fetchImpl: apiOk() } });
      expect(result.snapshot?.temperatureC).toBe(24.5);
    });

    it("el pronóstico de Buenos Aires de antes de la 0050 (sin ubicación) no se muestra", async () => {
      const { client } = fakeSupabase({ row: storedRow({ lat: null, lng: null }) });
      expect(await getEventWeather(client, event, { venue: venue(), now: after, fetchOptions: { fetchImpl: apiOk() } })).toEqual(SIN_CLIMA);
    });

    it("sin dato guardado no tiene clima y no pide nada", async () => {
      const { client } = fakeSupabase();
      const fetchImpl = apiOk();
      expect(await getEventWeather(client, event, { venue: venue(), now: after, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("una sede sin ubicación no genera el aviso de que falta: ya no hay clima que pedir", async () => {
      const { client } = fakeSupabase();
      const result = await getEventWeather(client, event, {
        venue: venue({ address: null, lat: null, lng: null }),
        now: after,
      });
      expect(result).toEqual(SIN_CLIMA);
    });
  });

  it("un evento más lejos de lo que se pronostica no llama a la API ni avisa de la ubicación", async () => {
    const { client } = fakeSupabase();
    const fetchImpl = apiOk();
    const farAway = new Date(START - 30 * 24 * HOUR);
    expect(await getEventWeather(client, event, { venue: venue(), now: farAway, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
    expect(
      await getEventWeather(client, event, { venue: venue({ address: null, lat: null, lng: null }), now: farAway, fetchOptions: { fetchImpl } }),
    ).toEqual(SIN_CLIMA);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("el límite del horizonte: a 16 días no se pronostica ni se lee el link ni se avisa; a 15 sí", async () => {
    const sinUbicacion = venue({ lat: null, lng: null });
    const dentro = new Date("2026-10-21T15:00:00Z"); // BA: 21/10 → el 5/11 está a 15 días
    const fuera = new Date("2026-10-20T15:00:00Z"); // 16 días

    const a = fakeSupabase();
    const resolveFuera = vi.fn().mockResolvedValue(null);
    expect(
      await getEventWeather(a.client, event, {
        venue: sinUbicacion,
        now: fuera,
        fetchOptions: { fetchImpl: apiOk() },
        resolveCoordinates: resolveFuera,
      }),
    ).toEqual(SIN_CLIMA);
    expect(resolveFuera).not.toHaveBeenCalled();

    const b = fakeSupabase();
    const resolveDentro = vi.fn().mockResolvedValue(null);
    expect(
      await getEventWeather(b.client, event, {
        venue: sinUbicacion,
        now: dentro,
        fetchOptions: { fetchImpl: apiOk() },
        resolveCoordinates: resolveDentro,
      }),
    ).toEqual({ snapshot: null, needsVenueLocation: true });
    expect(resolveDentro).toHaveBeenCalledTimes(1);
  });

  it("un link que no se pudo leer se reintenta pasada una hora según el reloj de la consulta, no el de la máquina", async () => {
    const { client } = fakeSupabase();
    const resolveCoordinates = vi.fn().mockResolvedValue(null);
    const options = {
      venue: venue({ lat: null, lng: null }),
      fetchOptions: { fetchImpl: apiOk() },
      resolveCoordinates,
    };
    await getEventWeather(client, event, { ...options, now: NOW });
    await getEventWeather(client, event, { ...options, now: new Date(NOW.getTime() + RETRY_AFTER_MS - 1) });
    expect(resolveCoordinates).toHaveBeenCalledTimes(1);
    await getEventWeather(client, event, { ...options, now: new Date(NOW.getTime() + RETRY_AFTER_MS) });
    expect(resolveCoordinates).toHaveBeenCalledTimes(2);
  });

  it("si no se puede leer la tabla (todavía no existe) no llama a la API ni muestra nada", async () => {
    const { client, upserts } = fakeSupabase({ selectError: { message: 'relation "event_weather" does not exist' } });
    const fetchImpl = apiOk();
    expect(await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl } })).toEqual(SIN_CLIMA);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("si no se puede guardar, igual muestra lo que se acaba de pedir", async () => {
    const { client } = fakeSupabase({ upsertError: { message: "new row violates row-level security policy" } });
    const result = await getEventWeather(client, event, { venue: venue(), now: NOW, fetchOptions: { fetchImpl: apiOk() } });
    expect(result.snapshot?.temperatureC).toBe(29);
  });

  it("nunca tira: un error inesperado deja al evento sin clima", async () => {
    const client = {
      from: () => {
        throw new Error("explotó");
      },
    } as unknown as SupabaseClient<Database>;
    expect(await getEventWeather(client, event, { venue: venue(), now: NOW })).toEqual(SIN_CLIMA);
  });
});
