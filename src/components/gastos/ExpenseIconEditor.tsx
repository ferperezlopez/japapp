"use client";

import { useState, useTransition } from "react";
import { updateExpenseIcon } from "@/app/gastos/actions";
import { updateInsumoItemIcon } from "@/app/eventos/actions";
import { Spinner } from "@/components/ui/Spinner";

// Mismo patrón inline que el pencil de ItemPicker.tsx (admin-only,
// input de emoji + Guardar). Si el gasto está ligado a un ítem del
// catálogo (itemId), edita insumo_items.icon (compartido con "compra
// de insumos" y otros gastos del mismo ítem); si no, edita
// expenses.icon directo (0034), propio de ese gasto puntual.
export function ExpenseIconEditor({
  expenseId,
  itemId,
  currentIcon,
  isAdmin,
}: {
  expenseId: string;
  itemId: string | null;
  currentIcon: string | null;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentIcon ?? "");
  const [pending, startTransition] = useTransition();

  if (!isAdmin) return null;

  function save() {
    startTransition(async () => {
      if (itemId) {
        await updateInsumoItemIcon(itemId, draft.trim());
      } else {
        await updateExpenseIcon(expenseId, draft.trim());
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="emoji"
          autoFocus
          className="w-12 rounded border border-surface-border bg-background px-1 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-xs font-medium text-eventos disabled:opacity-60"
        >
          {pending ? <Spinner className="h-3 w-3" /> : "Guardar"}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Editar emoji"
      aria-label="Editar emoji"
      className="text-xs text-foreground/30 hover:text-foreground/60"
    >
      ✏️
    </button>
  );
}
