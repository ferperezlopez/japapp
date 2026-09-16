"use client";

import { useTransition } from "react";
import { deleteExpense } from "@/app/gastos/actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

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
          await withMinDuration(deleteExpense(groupId, expenseId));
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs text-foreground/50 transition-colors duration-200 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
      title="Borrar gasto"
    >
      {pending && <Spinner className="h-3 w-3" />}
      Borrar
    </button>
  );
}
