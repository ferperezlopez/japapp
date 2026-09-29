"use client";

import { useState } from "react";
import { EditGuestNameModal } from "@/components/EditGuestNameModal";
import { abbreviateName } from "@/lib/formatName";
import { assignJerseyNumbers } from "@/lib/eventos/jerseyNumbers";
import { Jersey, GoalNet } from "./Jersey";

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

  const renderPlayer = (c: Candidate, variant: "light" | "dark" | "gk", number: number) => {
    const isMvp = stats?.mvpId === c.id;
    const isGoleador = stats?.goleadorId === c.id;
    return (
      <div key={c.id} className="flex flex-col items-center gap-0.5">
        <div className="relative">
          <Jersey number={number} variant={variant} />
          {isMvp && (
            <span
              title="MVP"
              aria-label="MVP"
              className="absolute -right-1 -top-1 text-sm leading-none drop-shadow"
            >
              ⭐
            </span>
          )}
          {isGoleador && (
            <span
              title="Goleador"
              aria-label="Goleador"
              className="absolute -left-1 -top-1 text-sm leading-none drop-shadow"
            >
              ⚽
            </span>
          )}
        </div>
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
    const variant = team === 2 ? "dark" : "light";

    return (
      <div className="overflow-hidden rounded-2xl border-2 border-white bg-green-600 p-3 dark:border-green-900">
        <span className="inline-block rounded-md bg-black/50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Equipo {team} ({total})
        </span>
        {total === 0 ? (
          <p className="mt-3 py-4 text-center text-xs text-white/70">Sin jugadores</p>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-3">
            {gk.length > 0 && (
              <div className="relative flex flex-col items-center">
                <GoalNet className="h-12 w-32" />
                <div className="-mt-3">
                  {gk.map((c) => renderPlayer(c, "gk", numbers.get(c.id) ?? 0))}
                </div>
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
      </div>
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
