"use client";

import { CalculatorForm } from "@/components/CalculatorForm";
import { Card } from "@/components/ui/Card";
import {
  calcularEmpanadas,
  EMPANADA_A_GUSTO,
  EMPANADA_RECETA,
} from "@/lib/calculators/empanadas";

export default function EmpanadasPage() {
  return (
    <div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Indicá la cantidad de docenas para calcular el relleno.
      </p>

      <div className="mt-6">
        <CalculatorForm
          inputLabel="Docenas"
          min={1}
          step={1}
          defaultValue={3}
          calcular={calcularEmpanadas}
        />
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
          Sal, pimienta, provenzal y laurel: a gusto (
          {EMPANADA_A_GUSTO.join(", ")}).
        </p>
      </div>

      <Card className="mt-8 p-4">
        <h2 className="text-sm font-medium">Receta</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {EMPANADA_RECETA.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
