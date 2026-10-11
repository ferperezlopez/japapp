// Tipos de JAPArcade compartidos entre el servidor y el navegador (solo tipos:
// este archivo no importa nada del servidor, se puede usar desde componentes
// de cliente).

/** `weekly`: la semana actual (lun–dom, hora de Buenos Aires). `all`: histórico. */
export type ArcadePeriod = "weekly" | "all";

/** Posición dentro de un ranking: `position` de `total` jugadores. */
export interface RankInfo {
  position: number;
  total: number;
}

/** Una fila del ranking: la mejor partida de un usuario. */
export interface LeaderboardEntry {
  position: number;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  score: number;
  /** Cuándo obtuvo ese puntaje (desempata: gana quien llegó primero). */
  achievedAt: string;
}

/** Lo que devuelve la server action al guardar una partida. */
export type SubmitScoreResult =
  | {
      ok: true;
      /** false si no había nada que guardar (0 puntos). */
      saved: boolean;
      /** Mejor puntaje del usuario en este juego, incluida esta partida. */
      bestScore: number;
      weekly: RankInfo | null;
      allTime: RankInfo | null;
    }
  | { ok: false; error: string };
