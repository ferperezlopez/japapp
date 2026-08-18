"use client";

import { useTransition } from "react";
import { deleteExpense } from "@/app/gastos/actions";

const TEXT_VARIANT = {
  neutral: "text-zinc-400 dark:hover:text-red-400",
  coral: "text-coral-ink/50 dark:text-coral-mid/60 dark:hover:text-red-400",
};

export function DeleteExpenseButton({
  groupId,
  expenseId,
  variant = "neutral",
}: {
  groupId: string;
  expenseId: string;
  variant?: "neutral" | "coral";
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
      className={`text-xs transition-colors duration-200 hover:text-red-600 disabled:opacity-60 ${TEXT_VARIANT[variant]}`}
      title="Borrar gasto"
    >
      Borrar
    </button>
  );
}
