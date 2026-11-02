import { describe, expect, it } from "vitest";
import { describeWeather } from "./weatherCodes";

describe("describeWeather", () => {
  it("traduce los códigos más comunes", () => {
    expect(describeWeather(0)).toEqual({ label: "Despejado", emoji: "☀️" });
    expect(describeWeather(3)).toEqual({ label: "Nublado", emoji: "☁️" });
    expect(describeWeather(63)).toEqual({ label: "Lluvia", emoji: "🌧️" });
    expect(describeWeather(95)).toEqual({ label: "Tormenta", emoji: "⛈️" });
  });

  it("un código que no conoce o la falta de dato no rompe nada", () => {
    expect(describeWeather(1234).emoji).toBe("🌡️");
    expect(describeWeather(null).label).toBe("Sin dato del cielo");
    expect(describeWeather(undefined).label).toBe("Sin dato del cielo");
  });

  it("cada código de la tabla tiene texto y emoji", () => {
    for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]) {
      const { label, emoji } = describeWeather(code);
      expect(label.length, `código ${code}`).toBeGreaterThan(0);
      expect(emoji.length, `código ${code}`).toBeGreaterThan(0);
      expect(label, `código ${code}`).not.toBe("Sin dato del cielo");
    }
  });
});
