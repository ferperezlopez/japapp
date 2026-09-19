"use client";

import { useEffect, useState, useTransition } from "react";
import { reportPayment } from "@/app/gastos/actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Button } from "@/components/ui/Button";

// Mismo shell de modal que EditGuestNameModal/ImageZoomModal (overlay,
// Escape/click afuera, bloqueo de scroll del body) — "informe de pago
// realizado" (0035): registra una transferencia real, el monto es
// editable por si se pagó parcial o un poco distinto a lo sugerido.
export function ReportPaymentButton({
  groupId,
  fromUserId,
  toUserId,
  fromName,
  toName,
  suggestedAmount,
}: {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  suggestedAmount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Marcar como pagado"
        className="shrink-0 text-xs font-medium text-eventos hover:underline"
      >
        ✅ Pagado
      </button>
      {open && (
        <ReportPaymentModal
          groupId={groupId}
          fromUserId={fromUserId}
          toUserId={toUserId}
          fromName={fromName}
          toName={toName}
          suggestedAmount={suggestedAmount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReportPaymentModal({
  groupId,
  fromUserId,
  toUserId,
  fromName,
  toName,
  suggestedAmount,
  onClose,
}: {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  suggestedAmount: number;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Marcar pago como realizado"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        action={(formData: FormData) => {
          setError(null);
          startTransition(async () => {
            const amount = Number(formData.get("amount"));
            const result = await withMinDuration(
              reportPayment(groupId, fromUserId, toUserId, amount),
            );
            if (result.error) setError(result.error);
            else onClose();
          });
        }}
        className="w-full max-w-xs space-y-3 rounded-2xl bg-background p-5 text-sm shadow-xl"
      >
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Marcar como pagado
        </h3>
        <p className="text-foreground/70">
          {fromName} → {toName}
        </p>
        <div>
          <label className="block text-xs font-medium text-foreground/50">Monto</label>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            defaultValue={suggestedAmount.toFixed(2)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" loading={pending}>
            {pending ? "Guardando..." : "Confirmar"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}
