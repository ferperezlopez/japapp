import { deltaView, type DeltaKind, type Polarity, type Tone } from "@/lib/analytics/delta";
import type { Comparison } from "@/lib/analytics/stats";

export const TONE_CLASSES: Record<Tone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-red-700 dark:text-red-400",
  equal: "text-foreground/50",
};

const TONE_WORDS: Record<Tone, string> = { good: "mejor", bad: "peor", equal: "igual" };

// Verde = mejor, rojo = peor, gris = igual (ver `delta.ts`). El color nunca va
// solo: la flecha y el signo del número dicen para qué lado fue, y un texto oculto
// dice «mejor» o «peor» para quien usa lector de pantalla.
export function DeltaBadge({
  comparison,
  kind,
  polarity,
  label,
}: {
  comparison: Comparison | null;
  kind: DeltaKind;
  polarity: Polarity;
  /** Para decir contra qué se compara cuando no lo aclara la pantalla. */
  label?: string;
}) {
  if (!comparison) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-1 text-xs text-foreground/40">
        <span>—</span>
        {label && <span>{label}</span>}
      </p>
    );
  }
  const { tone, direction, text } = deltaView(comparison, kind, polarity);
  const arrow = direction === "flat" ? "=" : direction === "up" ? "▲" : "▼";
  return (
    <p className={`flex flex-wrap items-baseline gap-x-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      <span aria-hidden="true" className="text-[10px]">
        {arrow}
      </span>
      <span className="tabular-nums">{text}</span>
      <span className="sr-only">, {TONE_WORDS[tone]}</span>
      {label && <span className="font-normal text-foreground/60">{label}</span>}
    </p>
  );
}

// La leyenda va una sola vez por pantalla, no en cada tarjeta. `what` dice qué se
// compara con qué (por defecto, el último evento contra el anterior).
export function DeltaLegend({
  what = "Variación del último evento contra el anterior.",
}: {
  what?: string;
}) {
  return (
    <p className="text-xs text-foreground/50">
      <span aria-hidden="true">▲▼ </span>
      {what} <span className="font-medium text-emerald-700 dark:text-emerald-400">Verde</span> es
      mejor y <span className="font-medium text-red-700 dark:text-red-400">rojo</span> peor: más
      asistencia y menos gasto.
    </p>
  );
}
