// Colores de las variaciones (spec 021). Verde = mejor, rojo = peor, gris = igual:
// más asistencia es mejor y MENOS gasto o costo también (la leyenda de las
// pantallas lo dice una vez). El color nunca va solo: la flecha, el signo y un
// texto para lector de pantalla dicen lo mismo.

import { formatMoneySigned, formatPercentSigned, formatPoints, formatSignedNumber } from "./format";
import type { Comparison } from "./stats";
import type { EventMetricKey } from "./types";

/** `money` y `count` muestran la variación relativa y la diferencia; `ratio` (un
 *  porcentaje contra otro) muestra la diferencia en puntos. */
export type DeltaKind = "money" | "count" | "ratio";
export type Polarity = "higher-better" | "lower-better";
export type Tone = "good" | "bad" | "equal";

// Por debajo de esto el formato lo redondea a 0: se dice «igual» y no «+0».
const EQUAL_BELOW: Record<DeltaKind, number> = { money: 0.5, count: 0.05, ratio: 0.005 };

export function isEqualDiff(diff: number, kind: DeltaKind): boolean {
  return Math.abs(diff) < EQUAL_BELOW[kind];
}

export function toneOf(diff: number, kind: DeltaKind, polarity: Polarity): Tone {
  if (isEqualDiff(diff, kind)) return "equal";
  return (diff > 0) === (polarity === "higher-better") ? "good" : "bad";
}

export const METRIC_KIND: Record<EventMetricKey, DeltaKind> = {
  confirmed: "count",
  ratio: "ratio",
  total: "money",
  costPerPerson: "money",
  medianItem: "money",
};

export const METRIC_POLARITY: Record<EventMetricKey, Polarity> = {
  confirmed: "higher-better",
  ratio: "higher-better",
  total: "lower-better",
  costPerPerson: "lower-better",
  medianItem: "lower-better",
};

// La variación escrita: «+7% (+$12.000)», «-2 pts», «+1 (+25%)». Si la base es 0 no
// hay porcentaje que decir y va solo la diferencia.
export function describeDelta(c: Comparison, kind: DeltaKind): string {
  if (kind === "ratio") return formatPoints(c.diff);
  if (kind === "money") {
    return c.pct === null
      ? formatMoneySigned(c.diff)
      : `${formatPercentSigned(c.pct)} (${formatMoneySigned(c.diff)})`;
  }
  return c.pct === null
    ? formatSignedNumber(c.diff)
    : `${formatSignedNumber(c.diff)} (${formatPercentSigned(c.pct)})`;
}

export type Direction = "up" | "down" | "flat";

export interface DeltaView {
  tone: Tone;
  /** Para dónde fue (la flecha); «flat» cuando se redondea a cero. */
  direction: Direction;
  /** «+7% (+$7)», o «igual». */
  text: string;
}

// Todo lo que hace falta para mostrar una variación, decidido en un solo lugar:
// lo usan la pantalla (`DeltaBadge`) y las infografías compartidas.
export function deltaView(c: Comparison, kind: DeltaKind, polarity: Polarity): DeltaView {
  const tone = toneOf(c.diff, kind, polarity);
  if (tone === "equal") return { tone, direction: "flat", text: "igual" };
  return { tone, direction: c.diff > 0 ? "up" : "down", text: describeDelta(c, kind) };
}
