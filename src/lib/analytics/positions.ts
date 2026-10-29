// Puestos de un evento entre los eventos pasados (spec 021): «2.º de 3 en gasto
// total», «el más alto en asistencia»… El puesto 1 es siempre el valor MÁS ALTO,
// sea bueno o malo: acá se ubica, no se juzga (los colores son de las variaciones).

import { formatMoneyCompact, formatNumber, formatPercent } from "./format";
import type { Position, PositionKey } from "./types";

export const POSITION_KEYS: PositionKey[] = [
  "confirmed",
  "ratio",
  "total",
  "costPerPerson",
  "medianItem",
  "items",
  "guests",
  "futbolConfirmed",
];

export const POSITION_LABELS: Record<PositionKey, string> = {
  confirmed: "Confirmados",
  ratio: "Asistencia",
  total: "Gasto total",
  costPerPerson: "Costo por persona",
  medianItem: "Gasto por ítem (mediana)",
  items: "Cantidad de ítems",
  guests: "Invitados",
  futbolConfirmed: "Jugadores de fútbol",
};

const POSITION_UNIT: Record<PositionKey, "count" | "percent" | "money"> = {
  confirmed: "count",
  ratio: "percent",
  total: "money",
  costPerPerson: "money",
  medianItem: "money",
  items: "count",
  guests: "count",
  futbolConfirmed: "count",
};

export function formatPositionValue(key: PositionKey, value: number): string {
  const unit = POSITION_UNIT[key];
  return unit === "money" ? formatMoneyCompact(value) : unit === "percent" ? formatPercent(value) : formatNumber(value);
}

export function formatRank(rank: number, of: number): string {
  return `#${rank} de ${of}`;
}

export interface PositionSource {
  id: string;
  /** null = este evento no tiene dato en esa categoría (no cuenta ni rankea). */
  values: Record<PositionKey, number | null>;
}

// Los empates comparten puesto (1, 1, 3). Solo compiten los eventos con dato:
// un evento sin gastos no es el «más barato», no está en ese ranking.
export function buildPositions(
  sources: readonly PositionSource[],
): Map<string, Record<PositionKey, Position>> {
  const peersByKey = Object.fromEntries(
    POSITION_KEYS.map((key) => [
      key,
      sources
        .map((s) => s.values[key])
        .filter((v): v is number => v !== null)
        .sort((a, b) => b - a),
    ]),
  ) as Record<PositionKey, number[]>;

  const result = new Map<string, Record<PositionKey, Position>>();
  for (const source of sources) {
    result.set(
      source.id,
      Object.fromEntries(
        POSITION_KEYS.map((key) => {
          const value = source.values[key];
          const peers = peersByKey[key];
          return [
            key,
            {
              value,
              rank: value === null ? null : 1 + peers.filter((p) => p > value).length,
              of: peers.length,
              peers,
            },
          ];
        }),
      ) as Record<PositionKey, Position>,
    );
  }
  return result;
}
