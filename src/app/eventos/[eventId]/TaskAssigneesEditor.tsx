"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee, updateTaskQuantity } from "../actions";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";
import { ItemPicker, NEW_ITEM_VALUE, type PickerItem } from "@/components/ItemPicker";
import { capitalizeFirst, MAX_QUANTITY_LENGTH, resolveIcon } from "@/lib/eventos/insumos";
import { groupByPerson, UNNAMED_ITEM_LABEL } from "@/lib/eventos/tasksShare";

type TaskType = "compra_insumos" | "lavado_platos" | "orden_sede";

type Assignee = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  itemName?: string | null;
  quantity?: string | null;
};

type Member = {
  id: string;
  name: string | null;
  email: string;
};

type Item = PickerItem;

// Mismo patrón visual que la sección de Invitados: chips/filas con X
// para sacar, más un "+ Agregar" que revela un <select> de los
// miembros que todavía no están en la lista, para no poder sumar a la
// misma persona dos veces... salvo en "compra_insumos" (ver abajo).
//
// "members" son las personas que se pueden asignar: la página manda solo a
// quienes confirmaron "Voy" a la juntada. Lo que ya está asignado se ve
// siempre, aunque esa persona después haya cambiado su respuesta.
//
// El prop "items" solo viene para "compra_insumos": ahí una persona
// puede traer más de un insumo, así que los assignees se agrupan por
// persona con sus insumos indentados debajo, cada uno con su propia X,
// más un "+ Agregar insumo" propio de esa persona para sumarle otro.
// Cada insumo puede tener una cantidad opcional ("2 kg", "3 litros"), que se carga
// al asignarlo o se completa y corrige después tocándola (`quantityEnabled`: la
// página lo apaga si la base todavía no tiene la columna, migración 0051).
// "lavado_platos"/"orden_sede" (sin "items") quedan con la lista plana
// de siempre, una fila por persona.
export function TaskAssigneesEditor({
  eventId,
  taskType,
  assignees,
  members,
  items,
  isAdmin = false,
  readOnly = false,
  quantityEnabled = false,
}: {
  eventId: string;
  taskType: TaskType;
  assignees: Assignee[];
  members: Member[];
  items?: Item[];
  isAdmin?: boolean;
  // Evento cerrado (spec 022): se ve quién se anotó, pero no se suma ni se saca a nadie.
  readOnly?: boolean;
  quantityEnabled?: boolean;
}) {
  // addTarget: null (cerrado), "__new__" (sumar una persona nueva, con
  // selector de miembro) o un userId (sumarle otro insumo a alguien
  // que ya está en la lista, sin selector de miembro).
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [itemSelection, setItemSelection] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [quantityDraft, setQuantityDraft] = useState("");
  const [savingQuantityId, setSavingQuantityId] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const requiresItem = !!items;
  const assignedIds = new Set(assignees.map((a) => a.userId));
  const available = members.filter((m) => !assignedIds.has(m.id));
  // Sin a quién ofrecer (la regla de «solo los confirmados» la explica la página una sola vez).
  const noCandidates =
    members.length === 0
      ? "Todavía no hay nadie confirmado para asignar."
      : "Ya están asignados todos los confirmados.";
  // Cargando una persona o un insumo (no sacando a alguien ni guardando una cantidad).
  const adding = pending && !removingId && !savingQuantityId;

  const resetAddState = () => {
    setAddTarget(null);
    setSelection("");
    setItemSelection("");
    setNewItemName("");
    setQuantity("");
    setError(null);
  };

  const submitAdd = (userId: string) => {
    const item = requiresItem
      ? itemSelection === NEW_ITEM_VALUE
        ? { newItemName }
        : { existingItemId: itemSelection }
      : undefined;
    setRemovingId(null);
    setError(null);
    startTransition(async () => {
      const result = await withMinDuration(
        addTaskAssignee(
          eventId,
          taskType,
          userId,
          item,
          requiresItem && quantityEnabled ? quantity : undefined,
        ),
      );
      if (result.error) {
        setError(result.error);
      } else {
        resetAddState();
      }
    });
  };

  const canSubmitItem =
    (itemSelection && itemSelection !== NEW_ITEM_VALUE) ||
    (itemSelection === NEW_ITEM_VALUE && newItemName.trim());

  const startEditQuantity = (rowId: string, current: string | null) => {
    setEditingQuantityId(rowId);
    setQuantityDraft(current ?? "");
    setQuantityError(null);
  };

  const cancelEditQuantity = () => {
    setEditingQuantityId(null);
    setQuantityError(null);
  };

  const saveQuantity = (rowId: string) => {
    setQuantityError(null);
    setSavingQuantityId(rowId);
    startTransition(async () => {
      const result = await withMinDuration(updateTaskQuantity(rowId, eventId, quantityDraft));
      setSavingQuantityId(null);
      if (result.error) {
        setQuantityError(result.error);
      } else {
        setEditingQuantityId(null);
      }
    });
  };

  const removeButton = (rowId: string) => (
    <button
      type="button"
      onClick={() => {
        setRemovingId(rowId);
        startTransition(async () => {
          await withMinDuration(removeTaskAssignee(rowId, eventId));
        });
      }}
      disabled={pending}
      className="rounded-full p-0.5 text-foreground/40 transition-colors duration-200 hover:bg-surface-border hover:text-red-600 disabled:opacity-60"
      title="Sacar de la tarea"
      aria-label="Sacar de la tarea"
    >
      {pending && removingId === rowId ? (
        <Spinner className="h-3 w-3" />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      )}
    </button>
  );

  const cancelButton = (
    <button
      type="button"
      onClick={resetAddState}
      className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
    >
      Cancelar
    </button>
  );

  if (!requiresItem) {
    return (
      <div>
        <ul className="flex flex-wrap gap-2">
          {assignees.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-surface py-1 pl-1 pr-2 text-xs text-foreground/80"
            >
              <Avatar src={a.avatarUrl} name={a.name} size="sm" />
              {a.name}
              {!readOnly && removeButton(a.id)}
            </li>
          ))}
          {assignees.length === 0 && (
            <li className="text-xs text-foreground/40">Sin asignar</li>
          )}
        </ul>

        {readOnly ? null : addTarget === "__new__" ? (
          <div className="mt-1.5 flex flex-wrap items-start gap-2">
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Elegí a alguien</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
            <Button
              type="button"
              loading={adding}
              disabled={!selection}
              onClick={() => submitAdd(selection)}
            >
              Sumar
            </Button>
            {cancelButton}
            {error && (
              <p className="w-full text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        ) : available.length === 0 ? (
          <p className="mt-1.5 text-xs text-foreground/40">{noCandidates}</p>
        ) : (
          <button
            type="button"
            onClick={() => setAddTarget("__new__")}
            className="mt-1.5 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
          >
            + Agregar
          </button>
        )}
      </div>
    );
  }

  // "compra_insumos": una fila por persona con sus insumos indentados.
  const groups = groupByPerson(assignees).map((g) => ({
    userId: g.userId,
    name: g.rows[0].name,
    avatarUrl: g.rows[0].avatarUrl,
    rows: g.rows.map((a) => ({
      rowId: a.id,
      itemName: a.itemName ?? null,
      quantity: a.quantity ?? null,
    })),
  }));

  const iconForItemName = (itemName: string) => {
    const found = items?.find((it) => it.name === itemName);
    return found ? resolveIcon(found) : resolveIcon({ name: itemName, icon: null });
  };

  // Se puede cargar o corregir la cantidad (la columna existe y el evento no está cerrado).
  const canEditQuantity = quantityEnabled && !readOnly;

  const quantityInput = quantityEnabled ? (
    <input
      type="text"
      value={quantity}
      onChange={(e) => setQuantity(e.target.value)}
      maxLength={MAX_QUANTITY_LENGTH}
      placeholder="Cantidad (opcional)"
      aria-label="Cantidad (opcional)"
      className="w-40 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
    />
  ) : null;

  // La cantidad de un insumo ya asignado, en la misma línea que su nombre.
  const quantityControl = (row: { rowId: string; quantity: string | null }) => {
    if (editingQuantityId === row.rowId) return null;
    if (row.quantity) {
      return canEditQuantity ? (
        <button
          type="button"
          onClick={() => startEditQuantity(row.rowId, row.quantity)}
          title="Cambiar la cantidad"
          className="rounded font-medium text-foreground/80 underline decoration-dotted underline-offset-2 transition-colors duration-200 hover:text-eventos"
        >
          · {row.quantity}
        </button>
      ) : (
        <span className="font-medium text-foreground/80">· {row.quantity}</span>
      );
    }
    return canEditQuantity ? (
      <button
        type="button"
        onClick={() => startEditQuantity(row.rowId, null)}
        className="text-foreground/40 transition-colors duration-200 hover:text-eventos"
      >
        + cantidad
      </button>
    ) : null;
  };

  return (
    <div>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.userId}>
            <div className="flex items-center gap-1.5 text-xs text-foreground/80">
              <Avatar src={g.avatarUrl} name={g.name} size="sm" />
              {g.name}
            </div>
            <ul className="ml-7 mt-1 space-y-1">
              {g.rows.map((r) => {
                const itemLabel = r.itemName ? capitalizeFirst(r.itemName) : null;
                const icon = r.itemName ? iconForItemName(r.itemName) : null;
                return (
                  <li key={r.rowId}>
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-foreground/60">
                      <span>
                        —{" "}
                        {itemLabel ? (
                          <>
                            {icon && <span aria-hidden="true">{icon} </span>}
                            {itemLabel}
                          </>
                        ) : (
                          UNNAMED_ITEM_LABEL
                        )}
                      </span>
                      {quantityControl(r)}
                      {!readOnly && removeButton(r.rowId)}
                    </div>
                    {editingQuantityId === r.rowId && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={quantityDraft}
                          onChange={(e) => setQuantityDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveQuantity(r.rowId);
                            } else if (e.key === "Escape") {
                              cancelEditQuantity();
                            }
                          }}
                          maxLength={MAX_QUANTITY_LENGTH}
                          placeholder="Ej: 2 kg, 3 litros"
                          aria-label={`Cantidad de ${itemLabel ?? "este insumo"}`}
                          autoFocus
                          className="w-40 rounded-lg border border-surface-border bg-background px-3 py-1.5 text-sm"
                        />
                        <Button
                          type="button"
                          className="py-1.5"
                          loading={savingQuantityId === r.rowId}
                          onClick={() => saveQuantity(r.rowId)}
                        >
                          Guardar
                        </Button>
                        <button
                          type="button"
                          onClick={cancelEditQuantity}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
                        >
                          Cancelar
                        </button>
                        {quantityError && (
                          <p className="w-full text-sm text-red-600 dark:text-red-400">
                            {quantityError}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {readOnly ? null : addTarget === g.userId ? (
              <div className="ml-7 mt-1 flex flex-wrap items-start gap-2">
                <ItemPicker
                  items={items!}
                  value={itemSelection}
                  onChange={setItemSelection}
                  newName={newItemName}
                  onNewNameChange={setNewItemName}
                  isAdmin={isAdmin}
                  capitalizeNames
                />
                {quantityInput}
                <Button
                  type="button"
                  loading={adding}
                  disabled={!canSubmitItem}
                  onClick={() => submitAdd(g.userId)}
                >
                  Sumar
                </Button>
                {cancelButton}
                {error && (
                  <p className="w-full text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddTarget(g.userId)}
                className="ml-7 mt-1 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
              >
                + Agregar insumo
              </button>
            )}
          </li>
        ))}
        {groups.length === 0 && (
          <li className="text-xs text-foreground/40">Sin asignar</li>
        )}
      </ul>

      {readOnly ? null : addTarget === "__new__" ? (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Elegí a alguien</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <ItemPicker
            items={items!}
            value={itemSelection}
            onChange={setItemSelection}
            newName={newItemName}
            onNewNameChange={setNewItemName}
            isAdmin={isAdmin}
            capitalizeNames
          />
          {quantityInput}
          <Button
            type="button"
            loading={adding}
            disabled={!selection || !canSubmitItem}
            onClick={() => submitAdd(selection)}
          >
            Sumar
          </Button>
          {cancelButton}
          {error && (
            <p className="w-full text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      ) : available.length === 0 ? (
        <p className="mt-2 text-xs text-foreground/40">{noCandidates}</p>
      ) : (
        <button
          type="button"
          onClick={() => setAddTarget("__new__")}
          className="mt-2 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          + Agregar persona
        </button>
      )}
    </div>
  );
}
