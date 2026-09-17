"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee } from "../actions";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { withMinDuration } from "@/lib/withMinDuration";
import {
  findSimilarItem,
  iconForInsumo,
  matchesQuery,
  normalize,
} from "@/lib/eventos/insumos";

const NEW_ITEM_VALUE = "__new__";

type TaskType = "compra_insumos" | "lavado_platos" | "orden_sede";

type Assignee = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  itemName?: string | null;
};

type Member = {
  id: string;
  name: string | null;
  email: string;
};

type Item = {
  id: string;
  name: string;
};

// Selector de insumo: combobox de texto buscable (en vez del <select>
// original) — tipear filtra los insumos ya cargados por substring, con su
// ícono si aplica (iconForInsumo). Si lo tipeado no matchea exacto a
// ninguno, se ofrece crearlo nuevo; si además se parece bastante a uno ya
// cargado (findSimilarItem, mismo umbral que find_similar_profile_names),
// se sugiere usar ese en vez de duplicar — no bloqueante, igual que el
// aviso de nombre parecido en /login: la sugerencia se puede ignorar y
// crear el insumo nuevo igual.
function ItemPicker({
  items,
  value,
  onChange,
  newName,
  onNewNameChange,
}: {
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  newName: string;
  onNewNameChange: (value: string) => void;
}) {
  const selectedName = items.find((it) => it.id === value)?.name ?? null;
  const [query, setQuery] = useState(selectedName ?? newName);
  const [open, setOpen] = useState(false);

  const filtered = items.filter((it) => matchesQuery(it.name, query));
  const trimmedQuery = query.trim();
  const exactMatch = items.find((it) => normalize(it.name) === normalize(trimmedQuery));
  const similar =
    value === NEW_ITEM_VALUE && trimmedQuery && !exactMatch
      ? findSimilarItem(items, trimmedQuery)
      : null;

  function selectExisting(item: Item) {
    onChange(item.id);
    onNewNameChange("");
    setQuery(item.name);
    setOpen(false);
  }

  function selectNew(name: string) {
    onChange(NEW_ITEM_VALUE);
    onNewNameChange(name);
    setQuery(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const text = e.target.value;
          setQuery(text);
          setOpen(true);
          onNewNameChange(text);
          if (value !== NEW_ITEM_VALUE) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar o cargar qué vas a comprar…"
        className="w-full min-w-48 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full min-w-48 overflow-auto rounded-lg border border-surface-border bg-background shadow-md">
          {filtered.map((it) => {
            const icon = iconForInsumo(it.name);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onMouseDown={() => selectExisting(it)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-surface"
                >
                  {icon && <span aria-hidden="true">{icon}</span>}
                  {it.name}
                </button>
              </li>
            );
          })}
          {trimmedQuery && !exactMatch && (
            <li>
              <button
                type="button"
                onMouseDown={() => selectNew(trimmedQuery)}
                className="w-full px-3 py-1.5 text-left text-sm font-medium text-eventos hover:bg-surface"
              >
                + Crear &quot;{trimmedQuery}&quot;
              </button>
            </li>
          )}
          {filtered.length === 0 && !trimmedQuery && (
            <li className="px-3 py-1.5 text-xs text-foreground/40">
              Sin insumos cargados todavía
            </li>
          )}
        </ul>
      )}
      {similar && (
        <p className="mt-1 text-xs text-amber-ink">
          ¿Quisiste decir &quot;{similar.name}&quot;?{" "}
          <button
            type="button"
            onClick={() => selectExisting(similar)}
            className="font-medium underline"
          >
            Usar este
          </button>
        </p>
      )}
    </div>
  );
}

// Mismo patrón visual que la sección de Invitados: chips/filas con X
// para sacar, más un "+ Agregar" que revela un <select> de los
// miembros que todavía no están en la lista, para no poder sumar a la
// misma persona dos veces... salvo en "compra_insumos" (ver abajo).
//
// El prop "items" solo viene para "compra_insumos": ahí una persona
// puede traer más de un insumo, así que los assignees se agrupan por
// persona con sus insumos indentados debajo, cada uno con su propia X,
// más un "+ Agregar insumo" propio de esa persona para sumarle otro.
// "lavado_platos"/"orden_sede" (sin "items") quedan con la lista plana
// de siempre, una fila por persona.
export function TaskAssigneesEditor({
  eventId,
  taskType,
  assignees,
  members,
  items,
}: {
  eventId: string;
  taskType: TaskType;
  assignees: Assignee[];
  members: Member[];
  items?: Item[];
}) {
  // addTarget: null (cerrado), "__new__" (sumar una persona nueva, con
  // selector de miembro) o un userId (sumarle otro insumo a alguien
  // que ya está en la lista, sin selector de miembro).
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [itemSelection, setItemSelection] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const requiresItem = !!items;
  const assignedIds = new Set(assignees.map((a) => a.userId));
  const available = members.filter((m) => !assignedIds.has(m.id));

  const resetAddState = () => {
    setAddTarget(null);
    setSelection("");
    setItemSelection("");
    setNewItemName("");
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
        addTaskAssignee(eventId, taskType, userId, item),
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
              {removeButton(a.id)}
            </li>
          ))}
          {assignees.length === 0 && (
            <li className="text-xs text-foreground/40">Sin asignar</li>
          )}
        </ul>

        {addTarget === "__new__" ? (
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
              loading={pending && !removingId}
              disabled={!selection}
              onClick={() => submitAdd(selection)}
            >
              Sumar
            </Button>
            <button
              type="button"
              onClick={resetAddState}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
            >
              Cancelar
            </button>
            {error && (
              <p className="w-full text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
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
  const groups: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    rows: { rowId: string; itemName: string | null }[];
  }[] = [];
  for (const a of assignees) {
    let group = groups.find((g) => g.userId === a.userId);
    if (!group) {
      group = { userId: a.userId, name: a.name, avatarUrl: a.avatarUrl, rows: [] };
      groups.push(group);
    }
    group.rows.push({ rowId: a.id, itemName: a.itemName ?? null });
  }

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
              {g.rows.map((r) => (
                <li
                  key={r.rowId}
                  className="flex items-center gap-1 text-xs text-foreground/60"
                >
                  — {r.itemName ? (
                    <>
                      {iconForInsumo(r.itemName) && (
                        <span aria-hidden="true">{iconForInsumo(r.itemName)} </span>
                      )}
                      {r.itemName}
                    </>
                  ) : (
                    "Insumo sin nombre"
                  )}
                  {removeButton(r.rowId)}
                </li>
              ))}
            </ul>
            {addTarget === g.userId ? (
              <div className="ml-7 mt-1 flex flex-wrap items-start gap-2">
                <ItemPicker
                  items={items!}
                  value={itemSelection}
                  onChange={setItemSelection}
                  newName={newItemName}
                  onNewNameChange={setNewItemName}
                />
                <Button
                  type="button"
                  loading={pending && !removingId}
                  disabled={!canSubmitItem}
                  onClick={() => submitAdd(g.userId)}
                >
                  Sumar
                </Button>
                <button
                  type="button"
                  onClick={resetAddState}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
                >
                  Cancelar
                </button>
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

      {addTarget === "__new__" ? (
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
          />
          <Button
            type="button"
            loading={pending && !removingId}
            disabled={!selection || !canSubmitItem}
            onClick={() => submitAdd(selection)}
          >
            Sumar
          </Button>
          <button
            type="button"
            onClick={resetAddState}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
          {error && (
            <p className="w-full text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
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
