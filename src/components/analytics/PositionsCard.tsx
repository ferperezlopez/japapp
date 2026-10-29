import { Card } from "@/components/ui/Card";
import { POSITION_KEYS, POSITION_LABELS, formatPositionValue } from "@/lib/analytics/positions";
import type { EventAnalytics, Position, PositionKey } from "@/lib/analytics/types";
import { RankPill } from "./RankPill";

// Dónde cae este evento entre todos los eventos pasados: una línea con un punto
// por evento (el nuestro resaltado), del valor más bajo al más alto.
function PositionStrip({ position, positionKey }: { position: Position; positionKey: PositionKey }) {
  const { peers, value } = position;
  const min = peers[peers.length - 1];
  const max = peers[0];
  // Todos iguales: los puntos van al medio en vez de dividir por cero.
  const at = (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
  return (
    <div aria-hidden="true" className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-foreground/50">
      <span className="w-14 shrink-0 text-right">{formatPositionValue(positionKey, min)}</span>
      <div className="relative h-4 flex-1 px-2">
        <div className="relative h-full">
          <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
          {peers.map((v, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
              style={{ left: `${at(v)}%` }}
            />
          ))}
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-eventos"
            style={{ left: `${at(value ?? min)}%` }}
          />
        </div>
      </div>
      <span className="w-14 shrink-0">{formatPositionValue(positionKey, max)}</span>
    </div>
  );
}

// Los puestos de un evento pasado en cada categoría. El puesto 1 es el valor más
// alto —sea bueno o malo—: acá se ubica, no se juzga. Solo entran las categorías
// donde este evento tiene dato y hay al menos otro con quién compararlo.
export function PositionsCard({ event }: { event: EventAnalytics }) {
  const positions = event.positions;
  if (!positions) return null;
  const keys = POSITION_KEYS.filter((key) => positions[key].rank !== null && positions[key].of >= 2);

  return (
    <Card className="p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground">Posiciones</h2>
      {keys.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/50">
          Hace falta al menos otro evento pasado con datos para ubicar a este.
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-surface-border">
            {keys.map((key) => {
              const position = positions[key];
              return (
                <li key={key} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-foreground/70">{POSITION_LABELS[key]}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-heading text-base font-semibold tabular-nums text-foreground">
                        {formatPositionValue(key, position.value as number)}
                      </span>
                      <RankPill rank={position.rank as number} of={position.of} />
                    </span>
                  </div>
                  <PositionStrip position={position} positionKey={key} />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-foreground/50">
            Entre los eventos pasados con ese dato. #1 es el valor más alto; cada punto es un evento y el
            azul es este.
          </p>
        </>
      )}
    </Card>
  );
}
