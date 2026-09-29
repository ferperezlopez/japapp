"use client";

import { useState } from "react";
import { EditGuestNameModal } from "@/components/EditGuestNameModal";
import { abbreviateName } from "@/lib/formatName";
import { assignJerseyNumbers } from "@/lib/eventos/jerseyNumbers";
import { Jersey, Pitch, PITCH_POSITIONS, ROW_X_SPAN, rowXPositions, type JerseyVariant } from "./Jersey";

type Candidate = { id: string; name: string; avatarUrl: string | null; guestId?: string };
type Position = "gk" | "def" | "fwd";
type SavedAssignment = { id: string; team: 1 | 2; position: Position };
type Stats = { mvpId: string | null; goleadorId: string | null } | null;

// Etiqueta de nombre bajo la camiseta: texto plano, o (si es invitado y
// isAdmin) un botón que abre el mismo editor que GuestNameButton — sin
// reusar ese componente porque siempre agrega un avatar, que no entra en
// una etiqueta tan chica como esta.
function NamePill({
  name,
  guestId,
  isAdmin,
}: {
  name: string;
  guestId?: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const className =
    "rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white";

  if (!guestId || !isAdmin) {
    return <span className={className}>{abbreviateName(name)}</span>;
  }

  return (
    <>
      <button
        type="button"
        title="Editar invitado"
        onClick={() => setEditing(true)}
        className={`${className} hover:underline`}
      >
        {abbreviateName(name)}
      </button>
      {editing && (
        <EditGuestNameModal
          guestId={guestId}
          currentName={name}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

// Vista de solo lectura de los equipos ya armados, con el mismo estilo
// de camiseta que el editor (TeamBuilderModal) pero en cancha propia por
// equipo (arco + arquero al frente, defensores y delanteros en filas
// debajo) — a diferencia del editor, acá no hace falta compartir una
// sola cancha entre los dos equipos porque no hay franjas para tocar.
// El MVP y el goleador (si ya se cargó el resultado) se marcan con un
// badge sobre la camiseta correspondiente.
export function TeamsPitchView({
  candidates,
  assignment,
  stats,
  isAdmin,
}: {
  candidates: Candidate[];
  assignment: SavedAssignment[];
  stats: Stats;
  isAdmin: boolean;
}) {
  const findCandidate = (id: string) => candidates.find((c) => c.id === id);

  const byPosition = (team: 1 | 2, position: Position) =>
    assignment
      .filter((a) => a.team === team && a.position === position)
      .map((a) => findCandidate(a.id))
      .filter((c): c is Candidate => !!c);

  const renderPlayer = (c: Candidate, variant: JerseyVariant, number: number) => {
    const isMvp = stats?.mvpId === c.id;
    const isGoleador = stats?.goleadorId === c.id;
    const badge = isMvp ? "mvp" : isGoleador ? "goleador" : undefined;
    return (
      <div key={c.id} className="flex flex-col items-center gap-0.5">
        <Jersey number={number} variant={variant} badge={badge} />
        <NamePill name={c.name} guestId={c.guestId} isAdmin={isAdmin} />
      </div>
    );
  };

  // Franja de posición: una banda horizontal absoluta a la altura exacta
  // (`yPercent`, ver PITCH_POSITIONS en Jersey.tsx) medida sobre la
  // imagen de formación que mandó el usuario. Cada jugador se ubica en
  // su propio % horizontal (`rowXPositions`, mismos extremos que esa
  // imagen) en vez de repartirse con flexbox.
  const renderRow = (
    position: Position,
    players: Candidate[],
    variant: JerseyVariant,
    yPercent: number,
    xSpan: [number, number],
    numbers: Map<string, number>,
  ) => {
    const xs = rowXPositions(players.length, xSpan);
    return (
      <div
        key={position}
        className="pointer-events-auto absolute left-0 w-full"
        style={{ top: `${yPercent}%`, transform: "translateY(-50%)" }}
      >
        {players.map((c, i) => (
          <div
            key={c.id}
            className="absolute top-1/2"
            style={{ left: `${xs[i]}%`, transform: "translate(-50%, -50%)" }}
          >
            {renderPlayer(c, variant, numbers.get(c.id) ?? 0)}
          </div>
        ))}
      </div>
    );
  };

  // Bloque de un equipo: se superpone entero sobre la cancha compartida
  // (ver `Pitch`) — cada jugador se posiciona directo con sus coordenadas
  // exactas, no hace falta dividir la cancha en mitades. La etiqueta va
  // en la esquina pegada al arco propio.
  const renderTeamBlock = (team: 1 | 2) => {
    const gk = byPosition(team, "gk");
    const def = byPosition(team, "def");
    const fwd = byPosition(team, "fwd");
    const numbers = assignJerseyNumbers([gk, def, fwd]);
    const total = gk.length + def.length + fwd.length;
    const variant: JerseyVariant = team === 2 ? "team2" : "team1";
    const gkVariant: JerseyVariant = team === 1 ? "gk1" : "gk2";
    const pos = PITCH_POSITIONS[team];

    const label = (
      <span
        className={`absolute left-2 ${team === 1 ? "top-2" : "bottom-2"} inline-block rounded-md bg-black/50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white`}
      >
        Equipo {team} <span className="text-slate-300">({total})</span>
      </span>
    );

    // pointer-events-none: mismo motivo que en TeamBuilderModal — los dos
    // equipos comparten una sola cancha como divs hermanos "absolute
    // inset-0", y el que se renderiza después (equipo 2) queda encima de
    // TODO el área, tapando el botón de "editar invitado" del equipo 1.
    // `renderRow` recupera el click con `pointer-events-auto`.
    if (total === 0) {
      return (
        <div key={team} className="pointer-events-none absolute inset-0">
          {label}
          <p className="flex h-full items-center justify-center text-xs text-white/70">
            Sin jugadores
          </p>
        </div>
      );
    }

    return (
      <div key={team} className="pointer-events-none absolute inset-0">
        {label}
        {gk.length > 0 && renderRow("gk", gk, gkVariant, pos.gkY, [50, 50], numbers)}
        {def.length > 0 &&
          renderRow("def", def, variant, def.length === 1 ? pos.defYSingle : pos.defY, ROW_X_SPAN.def, numbers)}
        {fwd.length > 0 && renderRow("fwd", fwd, variant, pos.fwdY, ROW_X_SPAN.fwd, numbers)}
      </div>
    );
  };

  return (
    <div>
      <Pitch>
        {renderTeamBlock(1)}
        {renderTeamBlock(2)}
      </Pitch>
      {(stats?.mvpId || stats?.goleadorId) && (
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/50">
          {stats?.mvpId && <span>🏆 MVP</span>}
          {stats?.goleadorId && <span>⚽ Goleador</span>}
        </p>
      )}
    </div>
  );
}
