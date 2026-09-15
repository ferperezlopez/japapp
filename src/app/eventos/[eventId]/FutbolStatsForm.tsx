"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { upsertFutbolStats } from "../actions";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

interface Candidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface Stats {
  resultado: string | null;
  mvpUserId: string | null;
  goleadorUserId: string | null;
}

export function FutbolStatsForm({
  eventId,
  stats,
  candidates,
}: {
  eventId: string;
  stats: Stats | null;
  candidates: Candidate[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const findCandidate = (id: string | null) =>
    candidates.find((c) => c.userId === id);

  const hasStats = !!(
    stats?.resultado ||
    stats?.mvpUserId ||
    stats?.goleadorUserId
  );

  const mvp = findCandidate(stats?.mvpUserId ?? null);
  const goleador = findCandidate(stats?.goleadorUserId ?? null);

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
            {stats?.mvpUserId && (
              <p className="flex items-center gap-1.5">
                <span className="text-foreground/50">MVP:</span>{" "}
                {mvp ? (
                  <Link
                    href={`/perfil/${mvp.userId}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <Avatar src={mvp.avatarUrl} name={mvp.name} size="sm" />
                    {mvp.name}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            )}
            {stats?.goleadorUserId && (
              <p className="flex items-center gap-1.5">
                <span className="text-foreground/50">Goleador:</span>{" "}
                {goleador ? (
                  <Link
                    href={`/perfil/${goleador.userId}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <Avatar
                      src={goleador.avatarUrl}
                      name={goleador.name}
                      size="sm"
                    />
                    {goleador.name}
                  </Link>
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
          const result = await upsertFutbolStats(eventId, formData);
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
            name="mvpUserId"
            defaultValue={stats?.mvpUserId ?? ""}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin elegir</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
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
            name="goleadorUserId"
            defaultValue={stats?.goleadorUserId ?? ""}
            className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin elegir</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
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
