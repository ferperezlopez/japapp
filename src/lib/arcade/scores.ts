// Persistencia de los puntajes de JAPArcade. SOLO SERVIDOR: usa la service
// role (bypasea RLS), así que nunca se importa desde un componente de cliente.
//
// Por qué la service role: la tabla arcade_scores no tiene policy de INSERT
// para usuarios, a propósito (ver 0041_arcade_scores.sql). La única forma de
// escribir es la server action de cada juego, que antes autentica al usuario
// y valida la partida (vuelve a simularla). Si los usuarios pudieran insertar
// directo por la API de Supabase, esa validación se podría saltear.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { toLeaderboardEntries } from "./ranking";
import type { ValidatedRun } from "./gustySnake/submit";
import type { ArcadePeriod, LeaderboardEntry } from "./types";

type Client = SupabaseClient<Database>;

/** Código de Postgres para unique_violation. */
const UNIQUE_VIOLATION = "23505";

export type SaveScoreResult =
  | { ok: true; /** false si esa partida ya estaba guardada (reintento). */ inserted: boolean }
  | { ok: false; error: string };

/**
 * Guarda una partida YA VALIDADA. Es idempotente: reintentar con el mismo
 * `client_run_id` (por ejemplo tras un corte de red) no duplica la fila.
 */
export async function saveArcadeScore(
  gameId: string,
  userId: string,
  run: ValidatedRun,
): Promise<SaveScoreResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("arcade_scores").insert({
    game_id: gameId,
    user_id: userId,
    score: run.score,
    duration_ms: run.durationMs,
    ticks: run.ticks,
    config_version: run.replay.v,
    client_run_id: run.clientRunId,
    replay: run.replay,
  });

  if (!error) return { ok: true, inserted: true };
  if (error.code === UNIQUE_VIOLATION) return { ok: true, inserted: false };
  return { ok: false, error: error.message };
}

/**
 * Ranking de un juego: una fila por usuario con su mejor puntaje. Usa la
 * sesión del usuario (las policies de lectura dejan ver a todos).
 */
export async function getLeaderboard(
  supabase: Client,
  gameId: string,
  period: ArcadePeriod,
): Promise<{ ok: true; entries: LeaderboardEntry[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("arcade_leaderboard", {
    p_game: gameId,
    p_period: period,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, entries: toLeaderboardEntries(data) };
}

/** Mejor puntaje histórico del usuario en un juego (0 si todavía no jugó). */
export async function getPersonalBest(
  supabase: Client,
  gameId: string,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("arcade_scores")
    .select("score")
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.score ?? 0;
}
