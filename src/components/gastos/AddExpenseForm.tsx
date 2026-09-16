"use client";

import { useState, useTransition } from "react";
import { addExpense } from "@/app/gastos/actions";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { withMinDuration } from "@/lib/withMinDuration";

interface Person {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

export function AddExpenseForm({
  groupId,
  people,
  defaultParticipantIds,
}: {
  groupId: string;
  // Cualquier persona registrada en la app puede figurar como quien pagó o
  // como participante de un gasto, no solo los miembros formales del grupo
  // (ver specs/002-gastos.md) — quien carga el gasto sigue necesitando ser
  // miembro real, eso lo gatea la página, no este formulario.
  people: Person[];
  // Quiénes vienen pre-tildados en "Se divide entre": los miembros
  // formales del grupo. El resto de la gente igual aparece en la lista,
  // pero hay que tildarla a mano — no queremos que sumar a alguien nuevo
  // al selector lo meta sin querer en la división de todos los gastos.
  defaultParticipantIds: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(addExpense(groupId, formData));
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
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Elegí quién pagó
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.email}
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
          {people.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-1.5 text-sm text-foreground/80"
            >
              <input
                type="checkbox"
                name="participants"
                value={p.id}
                defaultChecked={defaultParticipantIds.includes(p.id)}
              />
              <Avatar src={p.avatar_url} name={p.name ?? p.email} size="sm" />
              {p.name ?? p.email}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Guardando..." : "Agregar gasto"}
      </Button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
