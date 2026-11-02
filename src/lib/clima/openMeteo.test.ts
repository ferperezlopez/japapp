import { describe, expect, it, vi } from "vitest";
import { forecastJson, okResponse } from "./fixtures";
import { buildForecastUrl, eventHourLocal, fetchForecast, parseForecast } from "./openMeteo";

describe("buildForecastUrl", () => {
  it("pide las variables por hora, la zona de la ciudad y 16 días", () => {
    const url = new URL(buildForecastUrl());
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("-34.61");
    expect(url.searchParams.get("longitude")).toBe("-58.38");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m",
    );
    expect(url.searchParams.get("timezone")).toBe("America/Argentina/Buenos_Aires");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
  });

  it("acepta otra URL base (un servidor falso en las pruebas), con o sin barra final", () => {
    expect(buildForecastUrl("http://localhost:9999/")).toMatch(/^http:\/\/localhost:9999\/v1\/forecast\?/);
    expect(buildForecastUrl("http://localhost:9999")).toMatch(/^http:\/\/localhost:9999\/v1\/forecast\?/);
  });
});

describe("eventHourLocal", () => {
  it("toma la hora de los dígitos guardados, sin pasar por Date ni por la zona del servidor", () => {
    expect(eventHourLocal("2026-11-05T19:30:00+00:00")).toBe("2026-11-05T19:00");
    expect(eventHourLocal("2026-11-05T19:30:00.000Z")).toBe("2026-11-05T19:00");
    expect(eventHourLocal("2026-11-05T09:05:00+00:00")).toBe("2026-11-05T09:00");
    expect(eventHourLocal("2026-11-05T00:00:00+00:00")).toBe("2026-11-05T00:00");
  });
});

describe("parseForecast", () => {
  const json = forecastJson(["2026-11-05", "2026-11-06"]);

  it("elige los valores de la hora pedida", () => {
    expect(parseForecast(json, "2026-11-05T19:00")).toEqual({
      forecastFor: "2026-11-05T19:00",
      temperatureC: 29,
      precipitationProbability: 57,
      precipitationMm: 1.9,
      windKmh: 14.5,
      weatherCode: 3,
    });
  });

  it("distingue el mismo horario de dos días distintos", () => {
    const tomorrow = forecastJson(["2026-11-05", "2026-11-06"], (day, hour) => ({
      temperature_2m: day === "2026-11-06" ? 40 : 20,
      precipitation_probability: hour,
      weather_code: 0,
    }));
    expect(parseForecast(tomorrow, "2026-11-06T10:00")?.temperatureC).toBe(40);
    expect(parseForecast(tomorrow, "2026-11-05T10:00")?.temperatureC).toBe(20);
  });

  it("redondea la probabilidad y el código a enteros", () => {
    const j = forecastJson(["2026-11-05"], () => ({
      temperature_2m: 20.4,
      precipitation_probability: 33.6,
      weather_code: 61.2,
    }));
    const result = parseForecast(j, "2026-11-05T12:00");
    expect(result?.precipitationProbability).toBe(34);
    expect(result?.weatherCode).toBe(61);
    expect(result?.temperatureC).toBe(20.4);
  });

  it("si la hora pedida no está en la respuesta, devuelve null", () => {
    expect(parseForecast(json, "2026-12-25T19:00")).toBeNull();
  });

  it("una respuesta con otra forma devuelve null sin romper", () => {
    expect(parseForecast(null, "2026-11-05T19:00")).toBeNull();
    expect(parseForecast({}, "2026-11-05T19:00")).toBeNull();
    expect(parseForecast({ hourly: { time: "nope" } }, "2026-11-05T19:00")).toBeNull();
    expect(parseForecast({ error: true, reason: "Parameter out of range" }, "2026-11-05T19:00")).toBeNull();
  });

  it("sin temperatura, probabilidad ni cielo no hay nada que guardar", () => {
    const empty = forecastJson(["2026-11-05"], () => ({ precipitation: 0.2, wind_speed_10m: 10 }));
    expect(parseForecast(empty, "2026-11-05T12:00")).toBeNull();
  });

  it("los datos que faltan quedan en null, pero el resto se guarda", () => {
    const partial = forecastJson(["2026-11-05"], () => ({ temperature_2m: 18, weather_code: 2 }));
    expect(parseForecast(partial, "2026-11-05T12:00")).toEqual({
      forecastFor: "2026-11-05T12:00",
      temperatureC: 18,
      precipitationProbability: null,
      precipitationMm: null,
      windKmh: null,
      weatherCode: 2,
    });
  });
});

describe("fetchForecast", () => {
  const EVENT_DATE = "2026-11-05T19:30:00+00:00";
  const json = forecastJson(["2026-11-05"]);

  it("pide el pronóstico sin cachear y devuelve la hora del evento", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(json));
    const result = await fetchForecast(EVENT_DATE, { fetchImpl, baseUrl: "http://fake" });

    expect(result?.forecastFor).toBe("2026-11-05T19:00");
    expect(result?.temperatureC).toBe(29);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^http:\/\/fake\/v1\/forecast\?/);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("devuelve null si la API responde con error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await fetchForecast(EVENT_DATE, { fetchImpl })).toBeNull();
  });

  it("un error de la API se descarta aunque el cuerpo traiga datos que sirvan", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 503 }));
    expect(await fetchForecast(EVENT_DATE, { fetchImpl })).toBeNull();
  });

  it("devuelve null si la red falla", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchForecast(EVENT_DATE, { fetchImpl })).toBeNull();
  });

  it("devuelve null si la respuesta no es JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await fetchForecast(EVENT_DATE, { fetchImpl })).toBeNull();
  });

  it("devuelve null si la API tarda más del tiempo permitido", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await fetchForecast(EVENT_DATE, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 })).toBeNull();
  });

  it("devuelve null si la respuesta no trae la hora del evento", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(forecastJson(["2026-11-01"])));
    expect(await fetchForecast(EVENT_DATE, { fetchImpl })).toBeNull();
  });
});
