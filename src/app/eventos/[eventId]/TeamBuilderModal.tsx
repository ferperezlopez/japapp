"use client";

import { useEffect, useState, useTransition } from "react";
import { saveFutbolTeams } from "../actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

type Candidate = { userId: string; name: string; avatarUrl: string | null };
type Position = "gk" | "def" | "fwd";
type SavedAssignment = { userId: string; team: 1 | 2; position: Position };
type Location = "unassigned" | 1 | 2;

const POSITION_LABELS: Record<Position, string> = {
  gk: "Arquero",
  def: "Defensores",
  fwd: "Delanteros",
};

type JerseyVariant = "light" | "dark" | "gk";

const JERSEY_COLORS: Record<
  JerseyVariant,
  { fill: string; stroke: string; text: string }
> = {
  light: { fill: "#f8fafc", stroke: "#94a3b8", text: "#111827" },
  dark: { fill: "#111827", stroke: "#4b5563", text: "#f8fafc" },
  // El arquero se destaca con el mismo amarillo que ya usa la app para
  // "aviso/pendiente" (--color-amber en globals.css) — se adapta solo a
  // dark mode al ser una variable CSS, sin necesidad de un segundo set
  // de colores hardcodeados.
  gk: {
    fill: "var(--color-amber)",
    stroke: "var(--color-amber-hover)",
    text: "var(--color-amber-ink)",
  },
};

// "F. Perez" a partir de "Fernando Pérez López" — inicial del nombre +
// el primer apellido (no todos), para que entre cómodo en la casaca.
function nameOnJersey(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { initial: "", surname: parts[0] ?? "" };
  return { initial: `${parts[0][0]}.`, surname: parts[1] };
}

// Camiseta con nombre, SVG inline (sin dependencia nueva): clara para el
// Equipo 1, oscura para el Equipo 2, y un tercer color (arquero) sin
// importar el equipo — para que el arquero se distinga de un vistazo.
function Jersey({ name, variant }: { name: string; variant: JerseyVariant }) {
  const { fill, stroke, text } = JERSEY_COLORS[variant];
  const { initial, surname } = nameOnJersey(name);
  const surnameFontSize = surname.length > 7 ? 7 : 9;
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-16 shrink-0">
      <path
        d="M20 4 L8 14 L14 24 L18 21 L18 58 L46 58 L46 21 L50 24 L56 14 L44 4 L36 9 L28 9 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {initial && (
        <text
          x="32"
          y="33"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill={text}
        >
          {initial}
        </text>
      )}
      <text
        x="32"
        y={initial ? "46" : "40"}
        textAnchor="middle"
        fontSize={surnameFontSize}
        fontWeight="700"
        fill={text}
      >
        {surname}
      </text>
    </svg>
  );
}

// Tocar y ubicar (sin drag-and-drop, ver specs/015-armar-equipos-futbol.md):
// tocar un jugador lo selecciona, tocar una franja de posición (o "Sin
// asignar") lo mueve ahí. El estado se guarda como un mapa por userId en
// vez de arrays separados, para no tener que sincronizar manualmente de
// dónde sale un jugador cuando se mueve.
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
    Record<string, { location: Location; position: Position }>
  >(() => {
    const state: Record<string, { location: Location; position: Position }> =
      {};
    for (const c of candidates) {
      const saved = initialAssignment.find((a) => a.userId === c.userId);
      state[c.userId] = saved
        ? { location: saved.team, position: saved.position }
        : { location: "unassigned", position: "def" };
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

  const moveSelectedTo = (
    destination: "unassigned" | { team: 1 | 2; position: Position },
  ) => {
    if (!selectedUserId) return;
    setPlayerState((prev) => {
      if (destination === "unassigned") {
        if (prev[selectedUserId]?.location === "unassigned") return prev;
        return {
          ...prev,
          [selectedUserId]: { location: "unassigned", position: "def" },
        };
      }
      const { team, position } = destination;
      if (
        prev[selectedUserId]?.location === team &&
        prev[selectedUserId]?.position === position
      ) {
        return prev;
      }
      const next = { ...prev };
      // Un solo arquero a la vez por equipo: al arquero anterior se lo
      // pasa a defensores en vez de dejarlo sin equipo.
      if (position === "gk") {
        for (const id of Object.keys(next)) {
          if (
            id !== selectedUserId &&
            next[id].location === team &&
            next[id].position === "gk"
          ) {
            next[id] = { ...next[id], position: "def" };
          }
        }
      }
      next[selectedUserId] = { location: team, position };
      return next;
    });
    setSelectedUserId(null);
  };

  const byPosition = (team: 1 | 2, position: Position) =>
    candidates
      .filter(
        (c) =>
          playerState[c.userId]?.location === team &&
          playerState[c.userId]?.position === position,
      )
      .sort((a, b) => a.name.localeCompare(b.name));

  const teamOf = (team: 1 | 2) => {
    const gk = byPosition(team, "gk");
    const def = byPosition(team, "def");
    const fwd = byPosition(team, "fwd");
    return { gk, def, fwd, total: gk.length + def.length + fwd.length };
  };

  const team1 = teamOf(1);
  const team2 = teamOf(2);
  const unassigned = candidates.filter(
    (c) => playerState[c.userId]?.location === "unassigned",
  );

  const renderPitchChip = (c: Candidate, variant: JerseyVariant) => {
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
        className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-150 ${
          isSelected ? "bg-white/30 ring-2 ring-white" : "hover:bg-white/10"
        }`}
      >
        <Jersey name={c.name} variant={variant} />
      </div>
    );
  };

  const renderZone = (
    team: 1 | 2,
    position: Position,
    players: Candidate[],
  ) => (
    <div
      onClick={(event) => {
        event.stopPropagation();
        moveSelectedTo({ team, position });
      }}
      className="relative min-h-[6rem] cursor-pointer px-1 pb-1 pt-3.5"
    >
      <span className="absolute left-1 top-0.5 text-[9px] font-medium uppercase tracking-wide text-white/60">
        {POSITION_LABELS[position]}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {players.map((c) =>
          renderPitchChip(c, position === "gk" ? "gk" : team === 2 ? "dark" : "light"),
        )}
      </div>
    </div>
  );

  const renderUnassignedChip = (c: Candidate) => {
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
            : "bg-surface text-foreground/80 hover:bg-surface-border"
        }`}
      >
        <Avatar src={c.avatarUrl} name={c.name} size="sm" />
        {c.name}
      </div>
    );
  };

  const warnTeam1 = team1.total > 0 && team1.total < 4;
  const warnTeam2 = team2.total > 0 && team2.total < 4;

  const handleSave = () => {
    setError(null);
    const buildAssignments = (team: 1 | 2, t: ReturnType<typeof teamOf>) => [
      ...t.gk.map((c) => ({ userId: c.userId, team, position: "gk" as const })),
      ...t.def.map((c) => ({ userId: c.userId, team, position: "def" as const })),
      ...t.fwd.map((c) => ({ userId: c.userId, team, position: "fwd" as const })),
    ];
    const assignments = [
      ...buildAssignments(1, team1),
      ...buildAssignments(2, team2),
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
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-5"
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
          Tocá un jugador y después la franja (arquero, defensores,
          delanteros o &quot;Sin asignar&quot;) donde va.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-white bg-green-600 dark:border-green-900">
          <div className="relative flex flex-col divide-y-2 divide-white/70 dark:divide-green-900">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40"
            />

            {/* Equipo 2 (oscuro) — mitad de arriba, espejado: arquero
                arriba del todo, delanteros pegados a la línea de medio
                campo. */}
            <div className="flex flex-col-reverse p-2">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Equipo 2 ({team2.total})
              </p>
              {renderZone(2, "fwd", team2.fwd)}
              {renderZone(2, "def", team2.def)}
              {renderZone(2, "gk", team2.gk)}
            </div>

            {/* Equipo 1 (claro) — mitad de abajo: delanteros pegados a
                la línea de medio campo, arquero abajo del todo. */}
            <div className="flex flex-col p-2">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Equipo 1 ({team1.total})
              </p>
              {renderZone(1, "fwd", team1.fwd)}
              {renderZone(1, "def", team1.def)}
              {renderZone(1, "gk", team1.gk)}
            </div>
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
            {unassigned.map((c) => renderUnassignedChip(c))}
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
