import { describeSnapshot, formatAgo } from "@/lib/clima/format";
import type { WeatherSnapshot } from "@/lib/clima/types";

// El clima del evento (spec 024), en el encabezado: «☀️ 24° · Despejado · lluvia 10% ·
// viento 12 km/h». Es el pronóstico de la hora del evento en el lugar donde se hace (la sede).
// Antes de que empiece dice para qué sede es y de cuándo es el dato; una vez que empezó
// queda fijo y lo aclara. Open-Meteo pide que se nombre la fuente (CC BY 4.0).
export function WeatherLine({
  snapshot,
  venueName,
  frozen,
  nowMs,
}: {
  snapshot: WeatherSnapshot;
  /** El nombre de la sede, para decir de dónde es el pronóstico. */
  venueName: string;
  /** El evento ya empezó: el pronóstico no se actualiza más. */
  frozen: boolean;
  /** «Ahora», resuelto por la página (este componente no llama a Date.now). */
  nowMs: number;
}) {
  const parts = describeSnapshot(snapshot);
  const freshness = frozen
    ? "Pronóstico final, fijado al empezar el evento"
    : `Pronóstico para ${venueName}, actualizado ${formatAgo(new Date(snapshot.fetchedAt), new Date(nowMs))}`;

  return (
    <div className="mt-2" data-testid="event-weather">
      <p className="text-sm text-foreground/80">{parts.join(" · ")}</p>
      <p className="text-xs text-foreground/40">
        {freshness} ·{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground/60"
        >
          Open-Meteo.com
        </a>
      </p>
    </div>
  );
}

// El evento tiene sede pero no se sabe dónde queda (no tiene link de Google Maps, o no se pudo
// leer): no hay pronóstico que mostrar y se dice cómo conseguirlo.
export function WeatherNeedsLocation() {
  return (
    <p className="mt-2 text-xs text-foreground/50" data-testid="event-weather-needs-location">
      Para ver el clima, cargá el link de Google Maps de la sede (✏️ Editar lugar).
    </p>
  );
}
