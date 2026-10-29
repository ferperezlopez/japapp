// Comparación de un evento con los demás (spec 021), lista para dibujar: para cada
// indicador, las barras de los eventos de alrededor (anteriores y posteriores), la
// mediana del resto y cómo viene este evento contra esa mediana. Se arma en el
// servidor para las dos opciones —«todos los demás» y «similares»— y la pantalla
// solo elige cuál mostrar: así los textos salen ya formateados y no hay riesgo
// de que servidor y navegador formateen distinto.

import {
  COMPARE_METRICS,
  restMedian,
  similarOthers,
  windowAround,
  type CompareMetric,
  type CompareMode,
  type ComparePoint,
} from "./compare";
import { METRIC_KIND, METRIC_POLARITY, type DeltaKind, type Polarity } from "./delta";
import { formatDayShort, formatMoneyCompact, formatNumber, formatPercent } from "./format";
import { compare, type Comparison } from "./stats";
import type { EventAnalytics } from "./types";

// Con menos de esto la mediana es casi un solo evento: se avisa.
export const FEW_OTHERS = 3;

export interface ComparisonPoint extends ComparePoint {
  eventDate: string;
}

// Los eventos PASADOS en orden cronológico, listos para comparar (el próximo no).
// `events` viene como lo arma `buildAnalytics`: el próximo primero y después los
// pasados del más reciente al más viejo.
export function buildComparisonPoints(events: readonly EventAnalytics[]): ComparisonPoint[] {
  return events
    .filter((e) => e.status === "past")
    .reverse()
    .map((e) => ({
      id: e.id,
      eventDate: e.eventDate,
      hasFutbol: e.hasFutbol,
      confirmed: e.attendance.confirmed,
      ratio: e.attendance.ratio,
      total: e.spending?.total ?? null,
      costPerPerson: e.spending?.costPerPerson ?? null,
    }));
}

export interface ComparisonBar {
  id: string;
  label: string;
  value: number | null;
  valueLabel: string;
  current: boolean;
  href: string;
}

export interface ComparisonView {
  bars: ComparisonBar[];
  /** Mediana de los otros eventos de este conjunto; null si no hay con qué. */
  reference: number | null;
  referenceLabel: string;
  /** Este evento contra esa mediana. */
  vsMedian: Comparison | null;
  /** De cuántos eventos sale la mediana. */
  caption: string;
}

export interface ComparisonChart {
  key: CompareMetric;
  title: string;
  tone: "eventos" | "gastos";
  kind: DeltaKind;
  polarity: Polarity;
  views: Record<CompareMode, ComparisonView>;
}

export interface EventComparisonModel {
  charts: ComparisonChart[];
  /** «con fútbol» / «sin fútbol»: qué quiere decir «similar» para este evento. */
  similarKind: string;
  /** Cuántos otros eventos del mismo tipo hay: sin ninguno, «similares» no sirve. */
  similarCount: number;
}

const CHARTS: Record<CompareMetric, { title: string; tone: "eventos" | "gastos"; format: (n: number) => string }> = {
  confirmed: { title: "Confirmados", tone: "eventos", format: formatNumber },
  ratio: { title: "Asistencia", tone: "eventos", format: formatPercent },
  total: { title: "Gasto total", tone: "gastos", format: formatMoneyCompact },
  costPerPerson: { title: "Costo por persona", tone: "gastos", format: formatMoneyCompact },
};

function caption(mode: CompareMode, n: number, similarKind: string): string {
  const which = mode === "similar" ? ` ${similarKind}` : "";
  if (n === 0) return `No hay otros eventos${which} con este dato.`;
  // Con uno solo no hay mediana que valga: es ese evento.
  if (n === 1) return `Se compara con 1 solo evento${which}. Pocas muestras.`;
  const base = `Mediana de los otros ${n} eventos${which}.`;
  return n < FEW_OTHERS ? `${base} Pocas muestras.` : base;
}

// `points`: los eventos pasados en orden cronológico (el actual incluido). Devuelve
// null si el actual no está entre ellos (el próximo evento no se compara).
export function buildEventComparison(
  points: readonly ComparisonPoint[],
  currentId: string,
  size = 8,
): EventComparisonModel | null {
  const current = points.find((p) => p.id === currentId);
  if (!current) return null;
  const similarKind = current.hasFutbol ? "con fútbol" : "sin fútbol";

  const view = (metric: CompareMetric, mode: CompareMode): ComparisonView => {
    const set =
      mode === "similar"
        ? points.filter((p) => p.id === currentId || p.hasFutbol === current.hasFutbol)
        : [...points];
    const { format } = CHARTS[metric];
    const { median, n } = restMedian(points, metric, currentId, mode);
    const own = current[metric];
    return {
      bars: windowAround(
        set,
        set.findIndex((p) => p.id === currentId),
        size,
      ).map((p) => ({
        id: p.id,
        label: formatDayShort(p.eventDate),
        value: p[metric],
        valueLabel: p[metric] === null ? "—" : format(p[metric] as number),
        current: p.id === currentId,
        href: `/analytics/eventos/${p.id}`,
      })),
      reference: median,
      referenceLabel: median === null ? "mediana" : `mediana ${format(median)}`,
      vsMedian: own !== null && median !== null ? compare(own, median) : null,
      caption: caption(mode, n, similarKind),
    };
  };

  return {
    charts: COMPARE_METRICS.map((key) => ({
      key,
      title: CHARTS[key].title,
      tone: CHARTS[key].tone,
      kind: METRIC_KIND[key],
      polarity: METRIC_POLARITY[key],
      views: { all: view(key, "all"), similar: view(key, "similar") },
    })),
    similarKind,
    similarCount: similarOthers(points, currentId).length,
  };
}
