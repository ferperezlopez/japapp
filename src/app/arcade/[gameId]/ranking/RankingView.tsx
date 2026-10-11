import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { ArcadeGame } from "@/lib/arcade/games";
import type { ArcadePeriod, LeaderboardEntry } from "@/lib/arcade/types";

// Cuántos jugadores se listan; el resto del grupo (hoy 14) entra de sobra.
export const VISIBLE_ROWS = 50;

const scoreDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function displayName(entry: LeaderboardEntry): string {
  return entry.name?.trim() || "Jugador sin nombre";
}

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const podium = entry.position <= 3;
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? "bg-brand-soft" : ""}`}>
      <span
        className={`w-6 shrink-0 text-center font-heading text-lg tabular-nums ${
          podium ? "text-brand" : "text-foreground/40"
        }`}
      >
        {entry.position}
      </span>
      <Avatar src={entry.avatarUrl} name={displayName(entry)} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {displayName(entry)}
          {isMe && <span className="ml-2 text-xs font-semibold text-brand">Vos</span>}
        </p>
        <p className="text-xs text-foreground/50">
          {scoreDateFormatter.format(new Date(entry.achievedAt))}
        </p>
      </div>
      <span className="font-heading text-xl tabular-nums">{entry.score}</span>
    </li>
  );
}

// Presentación del ranking de un juego (sin acceso a datos: la página le pasa
// todo). `loadFailed` es true si la consulta del ranking dio error.
export function RankingView({
  game,
  period,
  entries,
  loadFailed,
  meId,
  weekLabel,
}: {
  game: ArcadeGame;
  period: ArcadePeriod;
  entries: readonly LeaderboardEntry[];
  loadFailed: boolean;
  meId: string;
  /** Rango de fechas de la semana actual, ya formateado (ver formatArcadeWeek). */
  weekLabel: string;
}) {
  const mine = entries.find((entry) => entry.userId === meId);
  const showMineApart = mine !== undefined && mine.position > VISIBLE_ROWS;

  const base = `/arcade/${game.id}/ranking`;
  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 transition-colors duration-200 ${
      active ? "bg-brand text-white" : "text-foreground/60 hover:text-foreground"
    }`;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/arcade" className="text-xs font-medium text-foreground/50 hover:underline">
        ← JAPArcade
      </Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        {game.name}
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">Ranking</h1>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-surface-border bg-surface p-1 text-sm font-medium">
          <Link href={base} className={tabClass(period === "weekly")}>
            Semanal
          </Link>
          <Link href={`${base}?periodo=historico`} className={tabClass(period === "all")}>
            Histórico
          </Link>
        </div>
        <Link
          href={game.href}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-brand-hover active:scale-[0.98]"
        >
          Jugar
        </Link>
      </div>

      <p className="mt-3 text-xs text-foreground/50">
        {period === "weekly"
          ? `Semana del ${weekLabel} (de lunes a domingo). La mejor partida de cada uno.`
          : "La mejor partida de cada uno, de todos los tiempos."}
      </p>

      {loadFailed ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">
          No pudimos cargar el ranking. Probá de nuevo en un rato.
        </p>
      ) : entries.length === 0 ? (
        <Card className="mt-6 p-6 text-center">
          <p className="font-medium">
            {period === "weekly" ? "Todavía nadie jugó esta semana." : "Todavía no hay puntajes."}
          </p>
          <p className="mt-1 text-sm text-foreground/60">¡Jugá y sé el primero del ranking!</p>
        </Card>
      ) : (
        <Card className="mt-6 divide-y divide-surface-border overflow-hidden">
          <ol className="divide-y divide-surface-border">
            {entries.slice(0, VISIBLE_ROWS).map((entry) => (
              <Row key={entry.userId} entry={entry} isMe={entry.userId === meId} />
            ))}
          </ol>
          {showMineApart && mine && (
            <div>
              <p className="px-4 pt-3 text-xs font-medium text-foreground/50">Tu posición</p>
              <ol>
                <Row entry={mine} isMe />
              </ol>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
