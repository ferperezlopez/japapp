"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { upsertFutbolStats } from "../actions";
import { withMinDuration } from "@/lib/withMinDuration";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { GuestNameButton } from "@/components/GuestNameButton";

interface Candidate {
  id: string;
  name: string;
  avatarUrl: string | null;
  guestId?: string;
}

interface Stats {
  resultado: string | null;
  mvpId: string | null;
  goleadorId: string | null;
}

export function FutbolStatsForm({
  eventId,
  stats,
  candidates,
  isAdmin,
}: {
  eventId: string;
  stats: Stats | null;
  candidates: Candidate[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const findCandidate = (id: string | null) =>
    candidates.find((c) => c.id === id);

  const hasStats = !!(stats?.resultado || stats?.mvpId || stats?.goleadorId);

  const mvp = findCandidate(stats?.mvpId ?? null);
  const goleador = findCandidate(stats?.goleadorId ?? null);

  if (!open) {
    return (
      <div className="mt-3 rounded-xl border border-surface-border bg-surface p-4 text-sm">
        {hasStats ? (
          <div className="space-y-1">
            {stats?.resultado && (
              <p>
                <span className="text-foreground/50">Resultado:</span>{" "}
                {stats.resultado}
              </p>
            )}
            {stats?.mvpId && (
              <p className="flex items-center gap-1.5">
                <span className="text-foreground/50">MVP:</span>{" "}
                {mvp ? (
                  mvp.guestId ? (
                    <GuestNameButton
                      guestId={mvp.guestId}
                      name={mvp.name}
                      isAdmin={isAdmin}
                      className="inline-flex items-center gap-1.5"
                    />
                  ) : (
                    <Link
                      href={`/perfil/${mvp.id.slice(2)}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Avatar src={mvp.avatarUrl} name={mvp.name} size="sm" />
                      {mvp.name}
                    </Link>
                  )
                ) : (
                  "—"
                )}
              </p>
            )}
            {stats?.goleadorId && (
              <p className="flex items-center gap-1.5">
                <span className="text-foreground/50">Goleador:</span>{" "}
                {goleador ? (
                  goleador.guestId ? (
                    <GuestNameButton
                      guestId={goleador.guestId}
                      name={goleador.name}
                      isAdmin={isAdmin}
                      className="inline-flex items-center gap-1.5"
                    />
                  ) : (
                    <Link
                      href={`/perfil/${goleador.id.slice(2)}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Avatar
                        src={goleador.avatarUrl}
                        name={goleador.name}
                        size="sm"
                      />
                      {goleador.name}
                    </Link>
                  )
                ) : (
                  "—"
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="text-foreground/50">
            Todavía no se cargó el resultado del partido.
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-foreground/50 transition-colors duration-200 hover:text-eventos"
        >
          {hasStats ? "Editar resultado" : "Cargar resultado"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await withMinDuration(upsertFutbolStats(eventId, formData));
          if (result.error) {
            setError(result.error);
          } else {
            setOpen(false);
          }
        });
      }}
      className="animate-reveal mt-3 space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <div>
        <label className="block text-xs font-medium text-foreground/50">
          Resultado
        </label>
        <input
          type="text"
          name="resultado"
          defaultValue={stats?.resultado ?? ""}
          placeholder="5 - 3"
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            MVP
          </label>
          <select
            name="mvpId"
            defaultValue={stats?.mvpId ?? ""}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin elegir</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/50">
            Goleador
          </label>
          <select
            name="goleadorId"
            defaultValue={stats?.goleadorId ?? ""}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin elegir</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/50 transition-colors duration-200 hover:bg-surface"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
