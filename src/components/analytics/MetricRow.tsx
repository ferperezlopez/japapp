import type { ReactNode } from "react";

// Una fila de una lista de indicadores: nombre y valor a los lados, una línea de
// contexto y, abajo, las comparativas. Mejor que una grilla en el celular: las
// comparativas son frases largas y en una tarjeta angosta se parten en mil.
export function MetricRow({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-foreground/70">{label}</p>
        <p className="shrink-0 font-heading text-lg font-semibold tabular-nums text-foreground">
          {value}
        </p>
      </div>
      {hint && <p className="mt-0.5 text-xs text-foreground/50">{hint}</p>}
      {children && <div className="mt-1.5 space-y-0.5">{children}</div>}
    </div>
  );
}
