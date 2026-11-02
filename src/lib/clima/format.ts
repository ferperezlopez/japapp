import { describeWeather } from "./weatherCodes";
import type { WeatherSnapshot } from "./types";

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/**
 * Las partes del renglón del clima, en orden: «☀️ 24°», «Despejado», «lluvia 10%»,
 * «viento 12 km/h». Las que no tienen dato no aparecen.
 */
export function describeSnapshot(snapshot: WeatherSnapshot): string[] {
  const { emoji, label } = describeWeather(snapshot.weatherCode);
  const parts: string[] = [];

  parts.push(
    snapshot.temperatureC === null ? emoji : `${emoji} ${Math.round(snapshot.temperatureC)}°`,
  );
  if (snapshot.weatherCode !== null) parts.push(label);
  if (snapshot.precipitationProbability !== null) {
    const mm =
      snapshot.precipitationMm !== null && snapshot.precipitationMm > 0
        ? ` (${decimal.format(snapshot.precipitationMm)} mm)`
        : "";
    parts.push(`lluvia ${snapshot.precipitationProbability}%${mm}`);
  }
  if (snapshot.windKmh !== null) parts.push(`viento ${Math.round(snapshot.windKmh)} km/h`);
  return parts;
}

/** «hace instantes», «hace 25 min», «hace 3 h», «hace 2 días». */
export function formatAgo(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return "hace instantes";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}
