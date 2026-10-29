"use client";

import { useState } from "react";
import type { CompareMode } from "@/lib/analytics/compare";
import type { EventComparisonModel } from "@/lib/analytics/eventComparison";
import { BarChart } from "./BarChart";
import { DeltaBadge, DeltaLegend } from "./DeltaBadge";

// Los gráficos que comparan un evento con los de alrededor y con la mediana del
// resto, con el selector «todos los demás / similares». Todo llega calculado y
// formateado del servidor: acá solo se elige cuál de las dos versiones mostrar.
export function EventComparison({ model }: { model: EventComparisonModel }) {
  const [mode, setMode] = useState<CompareMode>("all");
  const noSimilar = model.similarCount === 0;
  // Sin similares la opción no sirve; si quedó elegida, se vuelve a «todos».
  const active: CompareMode = noSimilar ? "all" : mode;

  const options: { mode: CompareMode; label: string; disabled: boolean }[] = [
    { mode: "all", label: "Todos los demás", disabled: false },
    { mode: "similar", label: `Similares · ${model.similarKind}`, disabled: noSimilar },
  ];

  return (
    <section aria-labelledby="comparado" className="space-y-3">
      <h2 id="comparado" className="font-heading text-lg font-semibold text-foreground">
        Comparado con los otros eventos
      </h2>

      <div role="group" aria-label="Con qué eventos comparar" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={option.disabled}
            aria-pressed={option.mode === active}
            onClick={() => setMode(option.mode)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
              option.mode === active
                ? "border-brand-mid bg-brand-soft text-brand-ink"
                : "border-surface-border text-foreground/60 enabled:hover:bg-background"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground/50">
        {noSimilar
          ? `No hay otros eventos ${model.similarKind} para comparar: «similares» se habilita con el próximo.`
          : active === "similar"
            ? `Solo eventos ${model.similarKind}: se muestran esos y la mediana es de ellos.`
            : "Todos los eventos pasados, con y sin fútbol."}
      </p>
      <DeltaLegend what="Este evento contra la mediana de los demás." />

      {model.charts.map((chart) => {
        const view = chart.views[active];
        return (
          <BarChart
            key={chart.key}
            title={chart.title}
            tone={chart.tone}
            points={view.bars}
            reference={view.reference}
            referenceLabel={view.referenceLabel}
          >
            {view.vsMedian && (
              <DeltaBadge
                comparison={view.vsMedian}
                kind={chart.kind}
                polarity={chart.polarity}
                label="vs. la mediana"
              />
            )}
            <p className="text-[11px] text-foreground/50">{view.caption}</p>
          </BarChart>
        );
      })}
    </section>
  );
}
