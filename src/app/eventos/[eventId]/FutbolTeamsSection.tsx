"use client";

import { useState } from "react";
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
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 1</h4>
            <div className="mt-1">{renderTeamSummary(1)}</div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 2</h4>
            <div className="mt-1">{renderTeamSummary(2)}</div>
          </div>
        </div>
      ) : (
        <p className="text-foreground/50">Todavía no se armaron los equipos.</p>
      )}
      {candidates.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          {hasTeams ? "Editar equipos" : "⚽ Armar equipos"}
        </button>
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
