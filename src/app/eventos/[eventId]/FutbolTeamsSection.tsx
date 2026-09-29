"use client";

import { useEffect, useState } from "react";
import { TeamBuilderModal } from "./TeamBuilderModal";
import { TeamsPitchView } from "./TeamsPitchView";

type Candidate = { id: string; name: string; avatarUrl: string | null; guestId?: string };
type Position = "gk" | "def" | "fwd";
type SavedAssignment = { id: string; team: 1 | 2; position: Position };
type Stats = { mvpId: string | null; goleadorId: string | null } | null;

// Mismo criterio visual que FutbolStatsForm (resumen de solo lectura +
// botón para editar), pero el editor es un modal (ver TeamBuilderModal),
// no un formulario inline: acomodar a 10 personas entre dos equipos pide
// más espacio e interacción que un <select>.
export function FutbolTeamsSection({
  eventId,
  candidates,
  initialAssignment,
  stats,
  isAdmin,
}: {
  eventId: string;
  candidates: Candidate[];
  initialAssignment: SavedAssignment[];
  stats: Stats;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const hasTeams = initialAssignment.length > 0;

  return (
    <div className="mt-3 rounded-xl border border-surface-border bg-surface p-4 text-sm">
      {hasTeams ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setViewOpen(true)}
            className="text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
          >
            👀 Ver equipos
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
          >
            Editar equipos
          </button>
        </div>
      ) : (
        <>
          <p className="text-foreground/50">Todavía no se armaron los equipos.</p>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
            >
              ⚽ Armar equipos
            </button>
          )}
        </>
      )}
      {viewOpen && (
        <ViewTeamsModal
          candidates={candidates}
          initialAssignment={initialAssignment}
          stats={stats}
          isAdmin={isAdmin}
          onEdit={() => {
            setViewOpen(false);
            setOpen(true);
          }}
          onClose={() => setViewOpen(false)}
        />
      )}
      {open && (
        <TeamBuilderModal
          eventId={eventId}
          candidates={candidates}
          initialAssignment={initialAssignment}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Mismo shell que ImageZoomModal (overlay, cierre con Escape/click afuera,
// bloqueo de scroll del body) — versión de solo lectura del detalle que
// antes se mostraba siempre expandido en la página del evento.
function ViewTeamsModal({
  candidates,
  initialAssignment,
  stats,
  isAdmin,
  onEdit,
  onClose,
}: {
  candidates: Candidate[];
  initialAssignment: SavedAssignment[];
  stats: Stats;
  isAdmin: boolean;
  onEdit: () => void;
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
      aria-label="Equipos"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5 text-sm"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">Equipos</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-full p-1.5 text-foreground/50 transition-colors duration-200 hover:bg-surface hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="mt-3">
          <TeamsPitchView
            candidates={candidates}
            assignment={initialAssignment}
            stats={stats}
            isAdmin={isAdmin}
          />
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          Editar equipos
        </button>
      </div>
    </div>
  );
}
