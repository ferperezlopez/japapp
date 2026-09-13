"use client";

import { useState, useTransition } from "react";
import { addExpense } from "@/app/gastos/actions";
import { Button } from "@/components/ui/Button";

interface Member {
  id: string;
  name: string | null;
  email: string;
}

export function AddExpenseForm({
  groupId,
  members,
}: {
  groupId: string;
  members: Member[];
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
      className="space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Descripción
          </label>
          <input
            type="text"
            name="description"
            required
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Monto
          </label>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Pagó
          </label>
          <select
            name="paidBy"
            required
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Fecha
          </label>
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Se divide entre
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-1.5 text-sm text-foreground/80"
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

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Agregar gasto"}
      </Button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
