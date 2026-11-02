"use client";

import { useState, useTransition } from "react";
import { addExpense, updateExpense } from "@/app/gastos/actions";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ItemPicker, NEW_ITEM_VALUE, type PickerItem } from "@/components/ItemPicker";
import { withMinDuration } from "@/lib/withMinDuration";

interface Person {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

// Un gasto ya cargado, para editarlo (0046): mismos campos que el formulario de
// alta, que se vuelve a usar tal cual con estos valores de partida.
export interface ExpenseToEdit {
  id: string;
  itemId: string | null;
  description: string;
  amount: number;
  paidBy: string;
  date: string;
  participantIds: string[];
}

export function AddExpenseForm({
  groupId,
  people,
  defaultParticipantIds,
  items,
  isAdmin = false,
  expense,
  onDone,
  className = "space-y-3 rounded-xl border border-surface-border bg-surface p-4",
}: {
  groupId: string;
  // Con un evento enlazado, quienes confirmaron "Voy" (más, al editar, quienes
  // ya están en ese gasto); en un grupo suelto, cualquier persona registrada
  // en la app (ver specs/002-gastos.md). Quien carga el gasto sigue necesitando
  // ser miembro real, eso lo gatea la página, no este formulario.
  people: Person[];
  // Quiénes vienen pre-tildados en "Se divide entre": los miembros
  // formales del grupo. El resto de la gente igual aparece en la lista,
  // pero hay que tildarla a mano — no queremos que sumar a alguien nuevo
  // al selector lo meta sin querer en la división de todos los gastos.
  // (Al editar se usan las personas que ya estaban en el gasto.)
  defaultParticipantIds: string[];
  // Mismo catálogo insumo_items que "compra de insumos" (ver
  // specs/002-gastos.md): elegir uno existente liga el gasto a su emoji;
  // tipear texto libre nuevo no crea un ítem de catálogo.
  items: PickerItem[];
  isAdmin?: boolean;
  // Si viene, el formulario edita ese gasto en vez de cargar uno nuevo.
  expense?: ExpenseToEdit;
  // Al editar: se llama al guardar o al cancelar, para que quien lo abrió lo cierre.
  onDone?: () => void;
  className?: string;
}) {
  const editing = !!expense;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [itemSelection, setItemSelection] = useState(
    expense ? (expense.itemId ?? NEW_ITEM_VALUE) : "",
  );
  const [newItemName, setNewItemName] = useState(
    expense && !expense.itemId ? expense.description : "",
  );
  // Fuerza a ItemPicker a remontar (y limpiar su texto visible) después de
  // un submit exitoso: a diferencia de TaskAssigneesEditor, acá el picker
  // queda siempre montado (no hay un "addTarget" que lo oculte).
  const [pickerKey, setPickerKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const checkedIds = expense ? expense.participantIds : defaultParticipantIds;

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(
            expense
              ? updateExpense(groupId, expense.id, formData)
              : addExpense(groupId, formData),
          );
          if (result.error) setError(result.error);
          else if (editing) onDone?.();
          else {
            setItemSelection("");
            setNewItemName("");
            setPickerKey((k) => k + 1);
          }
        });
      }}
      className={className}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Descripción
          </label>
          <div className="mt-1">
            <ItemPicker
              key={pickerKey}
              items={items}
              value={itemSelection}
              onChange={setItemSelection}
              newName={newItemName}
              onNewNameChange={setNewItemName}
              isAdmin={isAdmin}
              createLabel={(text) => `Usar "${text}"`}
              placeholder="Buscar o escribir una descripción…"
            />
          </div>
          <input
            type="hidden"
            name="existingItemId"
            value={itemSelection === NEW_ITEM_VALUE ? "" : itemSelection}
          />
          <input type="hidden" name="newItemName" value={newItemName} />
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
            defaultValue={expense?.amount}
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
            defaultValue={expense?.paidBy ?? ""}
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
            defaultValue={expense?.date ?? today}
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
                defaultChecked={checkedIds.includes(p.id)}
              />
              <Avatar src={p.avatar_url} name={p.name ?? p.email} size="sm" />
              {p.name ?? p.email}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {editing
            ? pending
              ? "Guardando..."
              : "Guardar cambios"
            : pending
              ? "Guardando..."
              : "Agregar gasto"}
        </Button>
        {editing && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
