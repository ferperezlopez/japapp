"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { TeamBuilderModal } from "./TeamBuilderModal";

type Candidate = { userId: string; name: string; avatarUrl: string | null };
type SavedAssignment = { userId: string; team: 1 | 2; isGoalkeeper: boolean };

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

  const findCandidate = (userId: string) =>
    candidates.find((c) => c.userId === userId);
  const team1 = initialAssignment.filter((a) => a.team === 1);
  const team2 = initialAssignment.filter((a) => a.team === 2);
  const hasTeams = initialAssignment.length > 0;

  const renderTeamChips = (assignment: SavedAssignment[]) => (
    <ul className="flex flex-wrap gap-2">
      {assignment.map((a) => {
        const c = findCandidate(a.userId);
        if (!c) return null;
        return (
          <li
            key={a.userId}
            className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 text-xs text-foreground/80"
          >
            <Avatar src={c.avatarUrl} name={c.name} size="sm" />
            {a.isGoalkeeper ? "🧤 " : ""}
            {c.name}
          </li>
        );
      })}
      {assignment.length === 0 && (
        <li className="text-xs text-foreground/40">Sin jugadores</li>
      )}
    </ul>
  );

  return (
    <div className="mt-3 rounded-xl border border-surface-border bg-surface p-4 text-sm">
      {hasTeams ? (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 1</h4>
            <div className="mt-1">{renderTeamChips(team1)}</div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-foreground/50">Equipo 2</h4>
            <div className="mt-1">{renderTeamChips(team2)}</div>
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
