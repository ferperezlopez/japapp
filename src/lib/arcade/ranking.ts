// Helpers puros del ranking (sin base de datos): convertir las filas de
// arcade_leaderboard() a la forma que usa la UI y ubicar a un usuario.

import type { LeaderboardEntry, RankInfo } from "./types";

/** Fila tal cual la devuelve la función SQL arcade_leaderboard(). */
export interface LeaderboardRow {
  pos: number;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  score: number;
  achieved_at: string;
}

export function toLeaderboardEntries(rows: readonly LeaderboardRow[] | null): LeaderboardEntry[] {
  return (rows ?? []).map((row) => ({
    position: row.pos,
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    score: row.score,
    achievedAt: row.achieved_at,
  }));
}

/** Posición del usuario dentro del ranking, o null si todavía no figura. */
export function findRank(
  entries: readonly LeaderboardEntry[],
  userId: string,
): RankInfo | null {
  const mine = entries.find((entry) => entry.userId === userId);
  return mine ? { position: mine.position, total: entries.length } : null;
}
