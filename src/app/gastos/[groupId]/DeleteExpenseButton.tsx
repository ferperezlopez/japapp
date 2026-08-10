"use client";

import { useTransition } from "react";
import { deleteExpense } from "../actions";

export function DeleteExpenseButton({
  groupId,
  expenseId,
}: {
  groupId: string;
  expenseId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteExpense(groupId, expenseId);
        })
      }
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
      title="Borrar gasto"
    >
      Borrar
    </button>
  );
}
