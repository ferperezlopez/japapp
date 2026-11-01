// Códigos de clima WMO que devuelve Open-Meteo (`weather_code`), con un texto en
// español y un emoji para cada grupo. Ver https://open-meteo.com/en/docs
export interface WeatherDescription {
  label: string;
  emoji: string;
}

const UNKNOWN: WeatherDescription = { label: "Sin dato del cielo", emoji: "🌡️" };

const TABLE: Record<number, WeatherDescription> = {
  0: { label: "Despejado", emoji: "☀️" },
  1: { label: "Mayormente despejado", emoji: "🌤️" },
  2: { label: "Parcialmente nublado", emoji: "⛅" },
  3: { label: "Nublado", emoji: "☁️" },
  45: { label: "Niebla", emoji: "🌫️" },
  48: { label: "Niebla con escarcha", emoji: "🌫️" },
  51: { label: "Llovizna débil", emoji: "🌦️" },
  53: { label: "Llovizna", emoji: "🌦️" },
  55: { label: "Llovizna intensa", emoji: "🌦️" },
  56: { label: "Llovizna helada", emoji: "🌧️" },
  57: { label: "Llovizna helada intensa", emoji: "🌧️" },
  61: { label: "Lluvia débil", emoji: "🌧️" },
  63: { label: "Lluvia", emoji: "🌧️" },
  65: { label: "Lluvia fuerte", emoji: "🌧️" },
  66: { label: "Lluvia helada", emoji: "🌧️" },
  67: { label: "Lluvia helada fuerte", emoji: "🌧️" },
  71: { label: "Nevada débil", emoji: "🌨️" },
  73: { label: "Nevada", emoji: "🌨️" },
  75: { label: "Nevada fuerte", emoji: "❄️" },
  77: { label: "Granizo fino", emoji: "🌨️" },
  80: { label: "Chubascos débiles", emoji: "🌦️" },
  81: { label: "Chubascos", emoji: "🌧️" },
  82: { label: "Chubascos violentos", emoji: "⛈️" },
  85: { label: "Chubascos de nieve", emoji: "🌨️" },
  86: { label: "Chubascos de nieve fuertes", emoji: "🌨️" },
  95: { label: "Tormenta", emoji: "⛈️" },
  96: { label: "Tormenta con granizo", emoji: "⛈️" },
  99: { label: "Tormenta con granizo fuerte", emoji: "⛈️" },
};

export function describeWeather(code: number | null | undefined): WeatherDescription {
  if (code === null || code === undefined) return UNKNOWN;
  return TABLE[code] ?? UNKNOWN;
}
