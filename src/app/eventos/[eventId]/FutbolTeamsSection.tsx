"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { TeamBuilderModal } from "./TeamBuilderModal";

type Candidate = { id: string; name: string; avatarUrl: string | null };
type Position = "gk" | "def" | "fwd";
type SavedAssignment = { id: string; team: 1 | 2; position: Position };

const POSITION_LABELS: Record<Position, string> = {
  gk: "Arquero",
  def: "Defensores",
  fwd: "Delanteros",
};

// Mismo criterio visual que FutbolStatsForm (resumen de solo lectura +
// botón para editar), pero el editor es un modal (ver TeamBuilderModal),
// no un formulario inline: acomodar a 10 personas entre dos equipos pide
// más espacio e interacción que un <select>.
export function FutbolTeamsSection({
  eventId,
  candidates,
  initialAssignment,
}: {
  eventId: string;
  candidates: Candidate[];
  initialAssignment: SavedAssignment[];
}) {
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const findCandidate = (id: string) => candidates.find((c) => c.id === id);
  const hasTeams = initialAssignment.length > 0;

  const renderTeamSummary = (team: 1 | 2) => {
    const assignment = initialAssignment.filter((a) => a.team === team);
    return (
      <div className="space-y-1.5">
        {(["gk", "def", "fwd"] as const).map((position) => {
          const players = assignment.filter((a) => a.position === position);
          if (players.length === 0) return null;
          return (
            <div key={position}>
              <h5 className="text-[11px] font-medium text-foreground/40">
                {POSITION_LABELS[position]}
              </h5>
              <ul className="mt-0.5 flex flex-wrap gap-2">
                {players.map((a) => {
                  const c = findCandidate(a.id);
                  if (!c) return null;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 text-xs text-foreground/80"
                    >
                      <Avatar src={c.avatarUrl} name={c.name} size="sm" />
                      {c.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {assignment.length === 0 && (
          <p className="text-xs text-foreground/40">Sin jugadores</p>
        )}
      </div>
    );
  };

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
          renderTeamSummary={renderTeamSummary}
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
  renderTeamSummary,
  onEdit,
  onClose,
}: {
  renderTeamSummary: (team: 1 | 2) => React.ReactNode;
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
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-5 text-sm"
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
        <div className="mt-3 space-y-3">
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 1</h4>
            <div className="mt-1">{renderTeamSummary(1)}</div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 2</h4>
            <div className="mt-1">{renderTeamSummary(2)}</div>
          </div>
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
