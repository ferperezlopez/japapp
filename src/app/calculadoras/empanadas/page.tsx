import { CalculatorForm } from "@/components/CalculatorForm";
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

      <div className="mt-8 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Receta</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {EMPANADA_RECETA.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
