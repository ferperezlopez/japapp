"use client";

import { useState } from "react";

export interface CalculatorRow {
  key: string;
  label: string;
  cantidad: number;
  unit: string;
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
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {inputLabel}
      </label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-1.5 w-32 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-coral dark:border-white/10 dark:bg-zinc-900"
      />

      <table className="mt-6 w-full text-sm">
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {rows.map((row) => (
            <tr key={row.key}>
              <td
                className={`py-2 text-zinc-700 dark:text-zinc-300 ${row.indent ? "pl-6 text-zinc-500 dark:text-zinc-500" : ""}`}
              >
                {row.label}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {row.cantidad} {row.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
