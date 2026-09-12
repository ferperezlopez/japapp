"use client";

import { CalculatorForm } from "@/components/CalculatorForm";
import { Card } from "@/components/ui/Card";
import { calcularAsado, CRIOLLA_BASE } from "@/lib/calculators/asado";

export default function AsadoPage() {
  return (
    <div>
      <p className="text-sm text-foreground/60">
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

      <Card className="mt-8 p-4">
        <h2 className="text-sm font-medium">
          Ensalada criolla (receta base, ~8-10 personas)
        </h2>
        <p className="mt-1 text-xs text-foreground/50">
          Duplicá o triplicá la receta para grupos más grandes.
        </p>
        <ul className="mt-3 list-inside list-disc text-sm text-foreground/80">
          {CRIOLLA_BASE.map((ingrediente) => (
            <li key={ingrediente}>{ingrediente}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
