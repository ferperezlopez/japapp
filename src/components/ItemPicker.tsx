"use client";

import { useState, useTransition } from "react";
import { updateInsumoItemIcon } from "@/app/eventos/actions";
import { Spinner } from "@/components/ui/Spinner";
import {
  findSimilarItem,
  matchesQuery,
  normalize,
  resolveIcon,
} from "@/lib/eventos/insumos";

export const NEW_ITEM_VALUE = "__new__";

export type PickerItem = {
  id: string;
  name: string;
  icon: string | null;
};

// Selector de ítem: combobox de texto buscable (compartido entre "compra
// de insumos" y Gastos, que apuntan al mismo catálogo insumo_items) —
// tipear filtra los ítems ya cargados por substring, con su emoji si
// aplica (resolveIcon: prioriza el guardado en la base, si no cae al
// derivado por palabra clave). Si lo tipeado no matchea exacto a
// ninguno, se ofrece "crear" uno nuevo (createLabel decide el texto
// exacto, porque en Gastos eso no crea nada en el catálogo, ver
// specs/002-gastos.md); si además se parece bastante a uno ya cargado
// (findSimilarItem, mismo umbral que find_similar_profile_names), se
// sugiere usar ese en vez de duplicar — no bloqueante.
export function ItemPicker({
  items,
  value,
  onChange,
  newName,
  onNewNameChange,
  isAdmin = false,
  createLabel = (text: string) => `+ Crear "${text}"`,
  placeholder = "Buscar o cargar qué vas a comprar…",
}: {
  items: PickerItem[];
  value: string;
  onChange: (value: string) => void;
  newName: string;
  onNewNameChange: (value: string) => void;
  isAdmin?: boolean;
  createLabel?: (text: string) => string;
  placeholder?: string;
}) {
  const selectedName = items.find((it) => it.id === value)?.name ?? null;
  const [query, setQuery] = useState(selectedName ?? newName);
  const [open, setOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [iconDraft, setIconDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = items.filter((it) => matchesQuery(it.name, query));
  const trimmedQuery = query.trim();
  const exactMatch = items.find((it) => normalize(it.name) === normalize(trimmedQuery));
  const similar =
    value === NEW_ITEM_VALUE && trimmedQuery && !exactMatch
      ? findSimilarItem(items, trimmedQuery)
      : null;

  function selectExisting(item: PickerItem) {
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

  function saveIcon(itemId: string) {
    startTransition(async () => {
      await updateInsumoItemIcon(itemId, iconDraft.trim());
      setEditingItemId(null);
    });
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
        onBlur={() => {
          setTimeout(() => {
            if (!editingItemId) setOpen(false);
          }, 150);
        }}
        placeholder={placeholder}
        className="w-full min-w-48 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full min-w-48 overflow-auto rounded-lg border border-surface-border bg-background shadow-md">
          {filtered.map((it) => {
            const icon = resolveIcon(it);
            return (
              <li key={it.id} className="flex items-center">
                <button
                  type="button"
                  onMouseDown={() => selectExisting(it)}
                  className="flex flex-1 items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-surface"
                >
                  {icon && <span aria-hidden="true">{icon}</span>}
                  {it.name}
                </button>
                {isAdmin &&
                  (editingItemId === it.id ? (
                    <span className="flex items-center gap-1 pr-2">
                      <input
                        type="text"
                        value={iconDraft}
                        onChange={(e) => setIconDraft(e.target.value)}
                        placeholder="emoji"
                        autoFocus
                        className="w-12 rounded border border-surface-border bg-background px-1 py-0.5 text-xs"
                      />
                      <button
                        type="button"
                        onMouseDown={() => saveIcon(it.id)}
                        disabled={pending}
                        className="text-xs font-medium text-eventos disabled:opacity-60"
                      >
                        {pending ? <Spinner className="h-3 w-3" /> : "Guardar"}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setEditingItemId(it.id);
                        setIconDraft(it.icon ?? "");
                      }}
                      title="Editar emoji"
                      aria-label="Editar emoji"
                      className="px-2 text-xs text-foreground/30 hover:text-foreground/60"
                    >
                      ✏️
                    </button>
                  ))}
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
                {createLabel(trimmedQuery)}
              </button>
            </li>
          )}
          {filtered.length === 0 && !trimmedQuery && (
            <li className="px-3 py-1.5 text-xs text-foreground/40">
              Sin ítems cargados todavía
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
