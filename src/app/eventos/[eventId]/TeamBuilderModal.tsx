"use client";

import { useEffect, useState, useTransition } from "react";
import { saveFutbolTeams } from "../actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

type Candidate = { userId: string; name: string; avatarUrl: string | null };
type SavedAssignment = { userId: string; team: 1 | 2; isGoalkeeper: boolean };
type Location = "unassigned" | 1 | 2;

// Tocar y ubicar (sin drag-and-drop, ver specs/015-armar-equipos-futbol.md):
// tocar un jugador lo selecciona, tocar un equipo o "Sin asignar" lo mueve
// ahí. El estado se guarda como un mapa por userId en vez de 3 arrays
// separados, para no tener que sincronizar manualmente de dónde sale un
// jugador cuando se mueve.
export function TeamBuilderModal({
  eventId,
  candidates,
  initialAssignment,
  onClose,
}: {
  eventId: string;
  candidates: Candidate[];
  initialAssignment: SavedAssignment[];
  onClose: () => void;
}) {
  const [playerState, setPlayerState] = useState<
    Record<string, { location: Location; isGoalkeeper: boolean }>
  >(() => {
    const state: Record<string, { location: Location; isGoalkeeper: boolean }> = {};
    for (const c of candidates) {
      const saved = initialAssignment.find((a) => a.userId === c.userId);
      state[c.userId] = saved
        ? { location: saved.team, isGoalkeeper: saved.isGoalkeeper }
        : { location: "unassigned", isGoalkeeper: false };
    }
    return state;
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const toggleSelect = (userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  };

  const moveSelectedTo = (destination: Location) => {
    if (!selectedUserId) return;
    setPlayerState((prev) => {
      if (prev[selectedUserId]?.location === destination) return prev;
      return {
        ...prev,
        [selectedUserId]: { location: destination, isGoalkeeper: false },
      };
    });
    setSelectedUserId(null);
  };

  // Un solo arquero a la vez por equipo: marcar a uno desmarca al anterior.
  const toggleGoalkeeper = (userId: string, team: 1 | 2) => {
    setPlayerState((prev) => {
      const makingGoalkeeper = !prev[userId]?.isGoalkeeper;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].location === team) {
          next[id] = { ...next[id], isGoalkeeper: id === userId && makingGoalkeeper };
        }
      }
      return next;
    });
  };

  const team1 = candidates.filter((c) => playerState[c.userId]?.location === 1);
  const team2 = candidates.filter((c) => playerState[c.userId]?.location === 2);
  const unassigned = candidates.filter(
    (c) => playerState[c.userId]?.location === "unassigned",
  );

  const renderChip = (c: Candidate, location: Location) => {
    const state = playerState[c.userId];
    const isSelected = selectedUserId === c.userId;
    return (
      <div
        key={c.userId}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          toggleSelect(c.userId);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            toggleSelect(c.userId);
          }
        }}
        className={`flex cursor-pointer items-center gap-1 rounded-full py-1 pl-1 pr-2 text-xs transition-colors duration-150 ${
          isSelected
            ? "bg-white text-foreground ring-2 ring-eventos"
            : location === "unassigned"
              ? "bg-surface text-foreground/80 hover:bg-surface-border"
              : "bg-white/90 text-foreground/80 hover:bg-white"
        }`}
      >
        <Avatar src={c.avatarUrl} name={c.name} size="sm" />
        {state?.isGoalkeeper ? "🧤 " : ""}
        {c.name}
        {location !== "unassigned" && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleGoalkeeper(c.userId, location);
            }}
            title={state?.isGoalkeeper ? "Sacar de arquero" : "Marcar como arquero"}
            aria-label={
              state?.isGoalkeeper ? "Sacar de arquero" : "Marcar como arquero"
            }
            className="ml-0.5 rounded-full p-0.5 leading-none hover:bg-black/10"
          >
            🧤
          </button>
        )}
      </div>
    );
  };

  const warnTeam1 = team1.length > 0 && team1.length < 4;
  const warnTeam2 = team2.length > 0 && team2.length < 4;

  const handleSave = () => {
    setError(null);
    const assignments = [
      ...team1.map((c) => ({
        userId: c.userId,
        team: 1 as const,
        isGoalkeeper: !!playerState[c.userId]?.isGoalkeeper,
      })),
      ...team2.map((c) => ({
        userId: c.userId,
        team: 2 as const,
        isGoalkeeper: !!playerState[c.userId]?.isGoalkeeper,
      })),
    ];
    startTransition(async () => {
      const result = await withMinDuration(saveFutbolTeams(eventId, assignments));
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Armar equipos"
      className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">⚽ Armar equipos</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-full p-1.5 text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-xs text-foreground/50">
          Tocá un jugador y después el equipo (o &quot;Sin asignar&quot;) donde
          va. El ícono 🧤 marca al arquero de cada equipo.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-white bg-green-600 dark:border-green-900">
          <div className="relative flex divide-x-2 divide-white/70 dark:divide-green-900">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40"
            />
            {([1, 2] as const).map((team) => {
              const teamPlayers = team === 1 ? team1 : team2;
              return (
                <div
                  key={team}
                  onClick={() => moveSelectedTo(team)}
                  className="relative min-h-[7rem] flex-1 cursor-pointer space-y-2 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-white">
                    Equipo {team} ({teamPlayers.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {teamPlayers.map((c) => renderChip(c, team))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(warnTeam1 || warnTeam2) && (
          <p className="mt-2 rounded-lg bg-amber-soft p-2 text-xs text-amber-ink">
            Cada equipo debería tener al menos 4 jugadores.
          </p>
        )}

        <div
          onClick={() => moveSelectedTo("unassigned")}
          className="mt-3 min-h-[3rem] cursor-pointer rounded-xl border border-dashed border-surface-border bg-surface p-3"
        >
          <p className="text-xs font-medium text-foreground/50">
            Sin asignar ({unassigned.length})
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unassigned.map((c) => renderChip(c, "unassigned"))}
            {unassigned.length === 0 && (
              <p className="text-xs text-foreground/40">Todos asignados</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" loading={pending} onClick={handleSave}>
            Guardar equipos
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
