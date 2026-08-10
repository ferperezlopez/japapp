import { CalculatorForm } from "@/components/CalculatorForm";
import { calcularAsado, CRIOLLA_BASE } from "@/lib/calculators/asado";

export default function AsadoPage() {
  return (
    <div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Indicá la cantidad de participantes para calcular cuánto comprar.
      </p>

      <div className="mt-6">
        <CalculatorForm
          inputLabel="Participantes"
          min={1}
          step={1}
          defaultValue={10}
          calcular={calcularAsado}
        />
      </div>

      <div className="mt-8 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">
          Ensalada criolla (receta base, ~8-10 personas)
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Duplicá o triplicá la receta para grupos más grandes.
        </p>
        <ul className="mt-3 list-inside list-disc text-sm text-zinc-700 dark:text-zinc-300">
          {CRIOLLA_BASE.map((ingrediente) => (
            <li key={ingrediente}>{ingrediente}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
