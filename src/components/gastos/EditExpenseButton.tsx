"use client";

import { useEffect, useState } from "react";
import { AddExpenseForm, type ExpenseToEdit } from "./AddExpenseForm";
import type { PickerItem } from "@/components/ItemPicker";

interface Person {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

// "Editar" un gasto (0046): quien lo cargó o un admin, mientras el evento no esté
// saldado (la página decide cuándo mostrarlo). Abre el mismo formulario que
// "Agregar gasto" con los valores del gasto, en el mismo shell de modal que
// ReportPaymentButton (overlay, Escape/click afuera, bloqueo de scroll).
export function EditExpenseButton({
  groupId,
  expense,
  people,
  items,
  isAdmin,
}: {
  groupId: string;
  expense: ExpenseToEdit;
  // Quienes confirmaron «Voy» más quienes ya figuran en este gasto, para no
  // dejar sin corregir a alguien que ya estaba aunque no haya confirmado.
  people: Person[];
  items: PickerItem[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Editar gasto"
        className="text-xs text-foreground/50 transition-colors duration-200 hover:text-eventos"
      >
        Editar
      </button>
      {open && (
        <EditExpenseModal
          groupId={groupId}
          expense={expense}
          people={people}
          items={items}
          isAdmin={isAdmin}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EditExpenseModal({
  groupId,
  expense,
  people,
  items,
  isAdmin,
  onClose,
}: {
  groupId: string;
  expense: ExpenseToEdit;
  people: Person[];
  items: PickerItem[];
  isAdmin: boolean;
  onClose: () => void;
}) {
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
      aria-label="Editar gasto"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-5 text-sm shadow-xl"
      >
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Editar gasto
        </h3>
        <AddExpenseForm
          groupId={groupId}
          people={people}
          defaultParticipantIds={expense.participantIds}
          items={items}
          isAdmin={isAdmin}
          expense={expense}
          onDone={onClose}
          className="mt-3 space-y-3"
        />
      </div>
    </div>
  );
}
