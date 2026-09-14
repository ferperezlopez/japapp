"use client";

import { useState } from "react";

export interface CalculatorRow {
  key: string;
  label: string;
  cantidad: number;
  unit: string;
  icon?: string;
  indent?: boolean;
}

interface CalculatorFormProps {
  inputLabel: string;
  step?: number;
  min?: number;
  defaultValue?: number;
  calcular: (value: number) => CalculatorRow[];
}

export function CalculatorForm({
  inputLabel,
  step = 1,
  min = 1,
  defaultValue = 10,
  calcular,
}: CalculatorFormProps) {
  const [value, setValue] = useState(defaultValue);
  const rows = calcular(value);

  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80">
        {inputLabel}
      </label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-1.5 w-32 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <table className="mt-6 w-full text-sm">
        <tbody className="divide-y divide-surface-border">
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className="animate-reveal"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <td
                className={`py-2.5 text-foreground/80 ${row.indent ? "pl-8 text-foreground/50" : ""}`}
              >
                {row.icon && (
                  <span className="mr-2 text-base" aria-hidden="true">
                    {row.icon}
                  </span>
                )}
                {row.label}
              </td>
              <td className="py-2.5 text-right font-semibold tabular-nums text-brand">
                {row.cantidad} {row.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
