import { describe, expect, it } from "vitest";
import { describeSnapshot, formatAgo } from "./format";
import type { WeatherSnapshot } from "./types";

const full: WeatherSnapshot = {
  forecastFor: "2026-11-05T19:00",
  temperatureC: 24.4,
  precipitationProbability: 10,
  precipitationMm: 0,
  windKmh: 12.4,
  weatherCode: 1,
  fetchedAt: "2026-11-05T10:00:00.000Z",
};

describe("describeSnapshot", () => {
  it("arma temperatura con emoji, cielo, lluvia y viento", () => {
    expect(describeSnapshot(full)).toEqual(["🌤️ 24°", "Mayormente despejado", "lluvia 10%", "viento 12 km/h"]);
  });

  it("redondea la temperatura al entero más cercano", () => {
    expect(describeSnapshot({ ...full, temperatureC: 24.5 })[0]).toBe("🌤️ 25°");
    // Math.round(-0.4) es -0, pero se muestra «0°», no «-0°».
    expect(describeSnapshot({ ...full, temperatureC: -0.4 })[0]).toBe("🌤️ 0°");
    expect(describeSnapshot({ ...full, temperatureC: -2.6 })[0]).toBe("🌤️ -3°");
  });

  it("suma los milímetros cuando se espera algo de lluvia", () => {
    expect(describeSnapshot({ ...full, precipitationProbability: 80, precipitationMm: 1.9 })).toContain(
      "lluvia 80% (1,9 mm)",
    );
  });

  it("omite lo que no tiene dato", () => {
    expect(
      describeSnapshot({
        ...full,
        temperatureC: null,
        weatherCode: null,
        precipitationProbability: null,
        windKmh: null,
      }),
    ).toEqual(["🌡️"]);
  });

  it("sin temperatura muestra solo el emoji del cielo", () => {
    expect(describeSnapshot({ ...full, temperatureC: null, weatherCode: 95 })[0]).toBe("⛈️");
  });
});

describe("formatAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;

  it("menos de un minuto", () => {
    expect(formatAgo(ago(20_000), now)).toBe("hace instantes");
    expect(formatAgo(new Date(now.getTime() + 5 * MIN), now)).toBe("hace instantes");
  });

  it("minutos, horas y días", () => {
    expect(formatAgo(ago(25 * MIN), now)).toBe("hace 25 min");
    expect(formatAgo(ago(59 * MIN), now)).toBe("hace 59 min");
    expect(formatAgo(ago(60 * MIN), now)).toBe("hace 1 h");
    expect(formatAgo(ago(3 * 60 * MIN + 40 * MIN), now)).toBe("hace 3 h");
    expect(formatAgo(ago(24 * 60 * MIN), now)).toBe("hace 1 día");
    expect(formatAgo(ago(50 * 60 * MIN), now)).toBe("hace 2 días");
  });
});
