import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

// Tarjeta de un indicador: nombre, valor grande, una línea de contexto y,
// debajo, las comparativas (`DeltaBadge`) que correspondan.
export function KpiCard({
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
    <Card className="p-4">
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-foreground/50">{hint}</p>}
      {children && <div className="mt-2 space-y-0.5">{children}</div>}
    </Card>
  );
}
