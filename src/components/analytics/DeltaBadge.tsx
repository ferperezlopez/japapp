import {
  formatMoneySigned,
  formatPercentSigned,
  formatPoints,
  formatSignedNumber,
  plural,
} from "@/lib/analytics/format";
import type { Comparison } from "@/lib/analytics/stats";
import type { MetricComparison } from "@/lib/analytics/types";

// `money` y `count` muestran la variación relativa y la diferencia; `ratio`
// (un porcentaje contra otro) muestra la diferencia en puntos.
export type DeltaKind = "money" | "count" | "ratio";

// Por debajo de esto el formato lo redondea a 0: se dice «igual» en vez de «+0».
const EQUAL_BELOW: Record<DeltaKind, number> = { money: 0.5, count: 0.05, ratio: 0.005 };

function describe(c: Comparison, kind: DeltaKind): string {
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

// Flecha neutra a propósito: más gasto no es «malo» ni más asistencia «buena»
// para todos, y pintar plata de rojo/verde pondría a alguien en falta. El signo
// del número ya dice para qué lado fue (también para quien usa lector de pantalla).
export function DeltaBadge({
  comparison,
  kind,
  label,
}: {
  comparison: Comparison | null;
  kind: DeltaKind;
  label: string;
}) {
  if (!comparison) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-1 text-xs text-foreground/40">
        <span aria-hidden="true">·</span>
        <span>— {label}</span>
      </p>
    );
  }
  const equal = Math.abs(comparison.diff) < EQUAL_BELOW[kind];
  const arrow = equal ? "=" : comparison.diff > 0 ? "▲" : "▼";
  return (
    <p className="flex flex-wrap items-baseline gap-x-1 text-xs text-foreground/60">
      <span aria-hidden="true" className="text-[10px]">
        {arrow}
      </span>
      <span className="font-medium tabular-nums text-foreground/80">
        {equal ? "igual" : describe(comparison, kind)}
      </span>
      <span>{label}</span>
    </p>
  );
}

// Las dos comparativas de un evento: contra el anterior y contra el promedio de
// los otros (diciendo cuántos son: con 1 o 2 eventos el promedio dice poco).
export function ComparisonLines({
  comparison,
  kind,
}: {
  comparison: MetricComparison;
  kind: DeltaKind;
}) {
  return (
    <>
      <DeltaBadge comparison={comparison.vsPrevious} kind={kind} label="vs. evento anterior" />
      <DeltaBadge
        comparison={comparison.vsAverage}
        kind={kind}
        label={`vs. promedio de ${plural(comparison.others, "evento", "eventos")}`}
      />
    </>
  );
}
