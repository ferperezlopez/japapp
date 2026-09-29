"use client";

import { useState } from "react";
import { EditGuestNameModal } from "@/components/EditGuestNameModal";
import { abbreviateName } from "@/lib/formatName";
import { assignJerseyNumbers } from "@/lib/eventos/jerseyNumbers";
import { Jersey, Pitch, type JerseyVariant } from "./Jersey";

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
    return (
      <div key={c.id} className="flex flex-col items-center gap-0.5">
        {/* En flujo normal (no absoluto) arriba de la camiseta, para que
            quede pegado siempre a la columna de este jugador puntual sin
            depender de dónde caiga un elemento posicionado encima de un
            SVG dentro de una fila que puede envolver. Altura fija
            siempre reservada (vacía si no aplica) para que todas las
            camisetas de una misma fila arranquen a la misma altura. */}
        <div className="flex h-4 items-center gap-0.5 text-sm leading-none">
          {isMvp && (
            <span title="MVP" aria-label="MVP">
              ⭐
            </span>
          )}
          {isGoleador && (
            <span title="Goleador" aria-label="Goleador">
              ⚽
            </span>
          )}
        </div>
        <Jersey number={number} variant={variant} />
        <NamePill name={c.name} guestId={c.guestId} isAdmin={isAdmin} />
      </div>
    );
  };

  const renderTeam = (team: 1 | 2) => {
    const gk = byPosition(team, "gk");
    const def = byPosition(team, "def");
    const fwd = byPosition(team, "fwd");
    const numbers = assignJerseyNumbers([gk, def, fwd]);
    const total = gk.length + def.length + fwd.length;
    const variant: JerseyVariant = team === 2 ? "team2" : "team1";
    const gkVariant: JerseyVariant = team === 1 ? "gk1" : "gk2";

    return (
      <Pitch>
        <span className="inline-block rounded-md bg-black/50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Equipo {team} <span className="text-slate-300">({total})</span>
        </span>
        {total === 0 ? (
          <p className="mt-3 py-4 text-center text-xs text-white/70">Sin jugadores</p>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-3">
            {gk.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                {gk.map((c) => renderPlayer(c, gkVariant, numbers.get(c.id) ?? 0))}
              </div>
            )}
            {def.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                {def.map((c) => renderPlayer(c, variant, numbers.get(c.id) ?? 0))}
              </div>
            )}
            {fwd.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                {fwd.map((c) => renderPlayer(c, variant, numbers.get(c.id) ?? 0))}
              </div>
            )}
          </div>
        )}
      </Pitch>
    );
  };

  return (
    <div className="space-y-3">
      {renderTeam(1)}
      {renderTeam(2)}
      {(stats?.mvpId || stats?.goleadorId) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/50">
          {stats?.mvpId && <span>⭐ MVP</span>}
          {stats?.goleadorId && <span>⚽ Goleador</span>}
        </p>
      )}
    </div>
  );
}
