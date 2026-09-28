"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

type Status = "yes" | "maybe" | "no";

// Círculo de color + glifo blanco por estado — mismo criterio de color que
// ya insinuaba STATUS_EMOJI (✅🤔❌), ahora con peso visual real. "yes"/"no"
// reusan verde/rojo crudos de Tailwind (sin agregar tokens nuevos a
// globals.css, mismo criterio que ya usa el resto del repo para rojo:
// mensajes de error, borde de la cancha en TeamBuilderModal); "maybe" reusa
// el token --color-amber que ya existe.
const STATUS_STYLES: Record<Status, { bg: string; text: string; glyph: string }> = {
  yes: { bg: "bg-green-600 dark:bg-green-500", text: "text-white", glyph: "✓" },
  maybe: { bg: "bg-amber", text: "text-amber-ink", glyph: "?" },
  no: { bg: "bg-red-600 dark:bg-red-500", text: "text-white", glyph: "✕" },
};

function StatusBadge({
  status,
  size = "md",
  title,
}: {
  status: Status;
  size?: "sm" | "md";
  title?: string;
}) {
  const { bg, text, glyph } = STATUS_STYLES[status];
  const sizeClasses = size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-base";
  return (
    <span
      title={title}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${bg} ${text} ${sizeClasses}`}
    >
      {glyph}
    </span>
  );
}

function StatItem({
  status,
  value,
  label,
}: {
  status: Status;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 px-2 first:pl-0 last:pr-0">
      <StatusBadge status={status} />
      <div>
        <p className="text-base font-medium leading-none text-foreground">
          {value}
        </p>
        <p className="text-[10px] text-foreground/50">{label}</p>
      </div>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4 shrink-0 text-eventos"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 18.5c0-2.5 2-4 5-4s5 1.5 5 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6.5a2.2 2.2 0 1 1 0 4.4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 14.7c1.9.3 3.5 1.6 3.5 3.8" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={`h-4 w-4 shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

type Counts = { yes: number; maybe: number; no: number };

// Colapsada por default (specs: la lista ocupaba demasiado espacio con el
// detalle de Juntada/Fútbol 5 siempre visible) — el estado de expandido es
// local a cada tarjeta, por eso es client component (el resto de /eventos
// sigue siendo server component). El link a /eventos/[id] queda acotado a
// nombre+fecha (no a toda la Card, como antes) para que el botón de
// expandir sea un control hermano, no anidado dentro del <a>.
export function EventListCard({
  event,
  index,
  dateLabel,
  myStatus,
  counts,
  futbolCounts,
}: {
  event: { id: string; name: string; location: string | null; has_futbol: boolean };
  index: number;
  dateLabel: string;
  myStatus?: Status;
  counts: Counts;
  futbolCounts: Counts;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className="animate-reveal px-4 py-3"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/eventos/${event.id}`}
          className="-m-1 min-w-0 flex-1 rounded-lg p-1 transition-colors duration-200 hover:bg-eventos-soft"
        >
          <p className="truncate font-medium">{event.name}</p>
          <p className="truncate text-xs text-foreground/50">
            {dateLabel}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {myStatus && (
            <StatusBadge status={myStatus} size="sm" title="Tu respuesta" />
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Ver menos" : "Ver detalle"}
            className="rounded-full p-1 text-foreground/40 transition-colors duration-200 hover:bg-eventos-soft hover:text-eventos"
          >
            <ChevronIcon className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <PeopleIcon />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                Juntada
              </p>
            </div>
            <div className="mt-1.5 flex divide-x divide-surface-border">
              <StatItem status="yes" value={counts.yes} label="confirmados" />
              <StatItem status="maybe" value={counts.maybe} label="en duda" />
              <StatItem status="no" value={counts.no} label="no vienen" />
            </div>
          </div>

          {event.has_futbol && (
            <div className="mt-3 rounded-xl bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-eventos text-xs text-white"
                >
                  ⚽
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                    Fútbol 5
                  </p>
                  <p className="text-[10px] text-foreground/40">
                    Para los que se suman a jugar
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex divide-x divide-surface-border">
                <StatItem status="yes" value={futbolCounts.yes} label="juegan" />
                <StatItem status="maybe" value={futbolCounts.maybe} label="en duda" />
                <StatItem status="no" value={futbolCounts.no} label="no juegan" />
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
