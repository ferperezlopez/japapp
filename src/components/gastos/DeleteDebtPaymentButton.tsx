"use client";

import { useTransition } from "react";
import { deleteDebtPayment } from "@/app/gastos/actions";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";

export function DeleteDebtPaymentButton({
  groupId,
  paymentId,
}: {
  groupId: string;
  paymentId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await withMinDuration(deleteDebtPayment(groupId, paymentId));
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs text-foreground/50 transition-colors duration-200 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
      title="Borrar pago reportado"
    >
      {pending && <Spinner className="h-3 w-3" />}
      Borrar
    </button>
  );
}
