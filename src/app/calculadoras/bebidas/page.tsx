"use client";

import { CalculatorForm } from "@/components/CalculatorForm";
import { calcularBebidas } from "@/lib/calculators/bebidas";

export default function BebidasPage() {
  return (
    <div className="animate-reveal">
      <p className="text-sm text-foreground/60">
        Indicá la cantidad de personas para calcular cuánto tomar: 0,5 botellas
        de vino, 0,75 L de cerveza y 0,5 L de gaseosa por persona.
      </p>

      <div className="mt-6">
        <CalculatorForm
          inputLabel="Personas"
          min={1}
          step={1}
          defaultValue={10}
          calcular={calcularBebidas}
          resultTitle={(n) => `🍷 Bebidas para ${n} personas`}
        />
      </div>
    </div>
  );
}
