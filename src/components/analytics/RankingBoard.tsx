"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { Board, PeopleMap } from "@/lib/analytics/boards";
import { RankingList } from "./RankingList";

export interface BoardOption {
  key: string;
  label: string;
  board: Board;
}

/** Una categoría; si tiene `children`, se elige además entre ellos (por ejemplo, el tipo de tarea). */
export interface BoardTab extends BoardOption {
  children?: BoardOption[];
}

function Chips({
  label,
  options,
  active,
  onSelect,
  small = false,
}: {
  label: string;
  options: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  small?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === active}
          onClick={() => onSelect(option.key)}
          className={`shrink-0 rounded-full border px-3 font-medium transition-colors duration-200 ${
            small ? "py-1 text-xs" : "py-1.5 text-sm"
          } ${
            option.key === active
              ? "border-brand-mid bg-brand-soft text-brand-ink"
              : "border-surface-border text-foreground/60 hover:bg-background"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Un ranking con selector: categorías en una fila de chips (que se desliza) y, si
// la categoría elegida tiene opciones propias —los tipos de tarea—, una segunda
// fila. Con una sola categoría es un ranking fijo (sin chips). Todo el contenido
// llega ya calculado del servidor: cambiar de categoría no pide nada.
export function RankingBoard({
  title,
  tabs,
  people,
  limit,
}: {
  title?: string;
  tabs: BoardTab[];
  people: PeopleMap;
  /** Cuántas filas mostrar antes de «Ver todos». Sin límite, todas. */
  limit?: number;
}) {
  const [tabKey, setTabKey] = useState(tabs[0]?.key ?? "");
  const [childKeys, setChildKeys] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const child = tab?.children?.find((c) => c.key === childKeys[tab.key]) ?? tab?.children?.[0];
  const board = child?.board ?? tab?.board;
  if (!tab || !board) return null;
  const canExpand = limit !== undefined && board.rows.length > limit;
  // Con selector, el nombre del ranking elegido se dice arriba de la lista; sin
  // selector ya lo dice el título de la tarjeta.
  const hasSelector = tabs.length > 1 || tab.children !== undefined;

  return (
    <Card className="p-4">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/50">{title}</h3>
      )}
      <div className={title ? "mt-2" : ""}>
        {tabs.length > 1 && (
          <Chips
            label="Categoría del ranking"
            options={tabs}
            active={tab.key}
            onSelect={(key) => {
              setTabKey(key);
              setExpanded(false);
            }}
          />
        )}
        {tab.children && child && (
          <div className={tabs.length > 1 ? "mt-1" : ""}>
            <Chips
              label="Tipo de tarea"
              small
              options={tab.children}
              active={child.key}
              onSelect={(key) => {
                setChildKeys((current) => ({ ...current, [tab.key]: key }));
                setExpanded(false);
              }}
            />
          </div>
        )}
      </div>

      {hasSelector && (
        <h4 className="mt-3 font-heading text-lg font-semibold text-foreground">{board.title}</h4>
      )}
      <div className="mt-1">
        <RankingList board={board} people={people} limit={expanded ? undefined : limit} />
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-medium text-foreground/60 hover:underline"
        >
          {expanded ? "Ver menos" : `Ver todos (${board.rows.length})`}
        </button>
      )}
      {board.note && board.rows.length > 0 && (
        <p className="mt-2 text-[11px] text-foreground/40">{board.note}</p>
      )}
    </Card>
  );
}
