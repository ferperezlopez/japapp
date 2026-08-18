"use client";

import { useState, useTransition } from "react";
import { addExpense } from "@/app/gastos/actions";

interface Member {
  id: string;
  name: string | null;
  email: string;
}

const CONTAINER_VARIANT = {
  neutral:
    "border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900",
  coral: "border-coral-mid/60 bg-white dark:border-coral/30 dark:bg-zinc-900",
};

const BUTTON_VARIANT = {
  neutral:
    "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  coral: "bg-coral text-white hover:bg-coral-hover",
};

export function AddExpenseForm({
  groupId,
  members,
  variant = "neutral",
}: {
  groupId: string;
  members: Member[];
  variant?: "neutral" | "coral";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await addExpense(groupId, formData);
          if (result.error) setError(result.error);
        });
      }}
      className={`space-y-3 rounded-xl border p-4 ${CONTAINER_VARIANT[variant]}`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Descripción
          </label>
          <input
            type="text"
            name="description"
            required
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Monto
          </label>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Pagó
          </label>
          <select
            name="paidBy"
            required
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Fecha
          </label>
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500">
          Se divide entre
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                name="participants"
                value={m.id}
                defaultChecked
              />
              {m.name ?? m.email}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${BUTTON_VARIANT[variant]}`}
      >
        {pending ? "Guardando..." : "Agregar gasto"}
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
