// Los cuatro indicadores de arriba de General (spec 021), con su texto ya
// armado: los comparten la pantalla (tarjetas) y la infografía, así lo que se ve
// y lo que se comparte nunca dicen cosas distintas.

import { formatMoneyCompact, formatNumber, formatPercent, orDash } from "./format";
import type { Comparison } from "./stats";
import type { EventMetricKey, GeneralAnalytics } from "./types";

export interface Kpi {
  /** Qué medida es (de ella salen el tipo de variación y qué es «mejor»). */
  metric: EventMetricKey;
  label: string;
  value: string;
  /** La línea de contexto: «promedio · mediana 5». */
  hint: string;
  /** El último evento contra el anterior. */
  comparison: Comparison | null;
}

export function buildGeneralKpis(g: GeneralAnalytics): Kpi[] {
  // Con pocas muestras no se dicen medianas entre eventos.
  const enough = g.sample === "enough";
  const { confirmed, ratio } = g.attendance;
  const { perEvent, costPerPerson } = g.spending;

  return [
    {
      metric: "confirmed",
      label: "Confirmados",
      value: orDash(confirmed.mean, formatNumber),
      hint:
        enough && confirmed.median !== null
          ? `por evento: promedio · mediana ${formatNumber(confirmed.median)}`
          : "por evento, en promedio",
      comparison: confirmed.vsPrevious,
    },
    {
      metric: "ratio",
      label: "Asistencia",
      value: orDash(ratio.mean, formatPercent),
      hint: "de los miembros, en promedio",
      comparison: ratio.vsPrevious,
    },
    {
      metric: "total",
      label: "Gasto total",
      value: formatMoneyCompact(g.spending.total),
      hint:
        perEvent.mean === null
          ? "sin gastos cargados"
          : `promedio por evento ${formatMoneyCompact(perEvent.mean)}`,
      comparison: perEvent.vsPrevious,
    },
    {
      metric: "costPerPerson",
      label: "Costo por persona",
      value: orDash(costPerPerson.mean, formatMoneyCompact),
      hint:
        enough && costPerPerson.median !== null
          ? `promedio · mediana ${formatMoneyCompact(costPerPerson.median)}`
          : "promedio por evento",
      comparison: costPerPerson.vsPrevious,
    },
  ];
}
