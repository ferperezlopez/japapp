"use client";

import { useState } from "react";
import { EditGuestNameModal } from "@/components/EditGuestNameModal";
import { abbreviateName } from "@/lib/formatName";
import {
  buildPitchTeams,
  type PitchAssignment,
  type PitchCandidate,
  type PitchPlayer,
  type PitchStats,
  type PitchTeam,
} from "@/lib/eventos/pitchLayout";
import { Jersey, Pitch } from "./Jersey";

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
//
// Qué jugador va dónde, con qué dorsal y camiseta, lo decide
// buildPitchTeams (src/lib/eventos/pitchLayout.ts), que también usa la imagen
// que se comparte por WhatsApp: acá solo se dibuja.
export function TeamsPitchView({
  candidates,
  assignment,
  stats,
  isAdmin,
}: {
  candidates: PitchCandidate[];
  assignment: PitchAssignment[];
  stats: PitchStats;
  isAdmin: boolean;
}) {
  const renderPlayer = (player: PitchPlayer) => (
    <div key={player.id} className="flex flex-col items-center gap-0.5">
      <Jersey number={player.number} variant={player.variant} badge={player.badge} />
      <NamePill name={player.name} guestId={player.guestId} isAdmin={isAdmin} />
    </div>
  );

  // Franja de posición: una banda horizontal absoluta a la altura exacta
  // (`y`, ver PITCH_POSITIONS en pitchLayout.ts) medida sobre la imagen de
  // formación que mandó el usuario. Cada jugador se ubica en su propio %
  // horizontal (`x`, mismos extremos que esa imagen) en vez de repartirse
  // con flexbox.
  const renderRow = (row: PitchTeam["rows"][number]) => (
    <div
      key={row.position}
      className="pointer-events-auto absolute left-0 w-full"
      style={{ top: `${row.y}%`, transform: "translateY(-50%)" }}
    >
      {row.players.map((player) => (
        <div
          key={player.id}
          className="absolute top-1/2"
          style={{ left: `${player.x}%`, transform: "translate(-50%, -50%)" }}
        >
          {renderPlayer(player)}
        </div>
      ))}
    </div>
  );

  // Bloque de un equipo: se superpone entero sobre la cancha compartida
  // (ver `Pitch`) — cada jugador se posiciona directo con sus coordenadas
  // exactas, no hace falta dividir la cancha en mitades. La etiqueta va
  // en la esquina pegada al arco propio.
  const renderTeamBlock = ({ team, total, rows }: PitchTeam) => {
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
        {rows.map(renderRow)}
      </div>
    );
  };

  const [team1, team2] = buildPitchTeams(candidates, assignment, stats);

  return (
    <div>
      <Pitch>
        {renderTeamBlock(team1)}
        {renderTeamBlock(team2)}
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
