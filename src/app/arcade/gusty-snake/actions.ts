"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GUSTY_SNAKE_CONFIG, GUSTY_SNAKE_GAME_ID } from "@/lib/arcade/gustySnake/config";
import { STALE_VERSION_ERROR } from "@/lib/arcade/gustySnake/replay";
import { validateSubmission } from "@/lib/arcade/gustySnake/submit";
import { findRank } from "@/lib/arcade/ranking";
import { getLeaderboard, getPersonalBest, saveArcadeScore } from "@/lib/arcade/scores";
import type { SubmitScoreResult } from "@/lib/arcade/types";

// Guarda una partida de Gusty Glotón. Es una puerta pública (cualquiera puede
// mandarle un POST), así que no confía en nada de lo que llega: autentica al
// usuario, vuelve a jugar la partida con el mismo motor y recién ahí inserta
// el puntaje que ELLA recalculó (ver submit.ts y replay.ts).
export async function submitGustyScore(input: unknown): Promise<SubmitScoreResult> {
  const supabase = await createClient();
  // Siempre el usuario real de la sesión, nunca el de "actuar como": un admin
  // que mira como otra persona no tiene que generar puntajes ajenos.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No estás logueado." };

  const validated = validateSubmission(input, GUSTY_SNAKE_CONFIG);
  if (!validated.ok) {
    if (validated.error === STALE_VERSION_ERROR) {
      return {
        ok: false,
        error: "Hay una versión nueva del juego. Recargá la app para poder guardar tus puntajes.",
      };
    }
    console.warn("[arcade] partida rechazada", { userId: user.id, reason: validated.error });
    return { ok: false, error: "No pudimos validar la partida, así que no se guardó el puntaje." };
  }
  const { run } = validated;

  // Una partida en 0 no entra al ranking: no hay nada que guardar.
  if (run.score === 0) {
    const bestScore = await getPersonalBest(supabase, GUSTY_SNAKE_GAME_ID, user.id);
    return { ok: true, saved: false, bestScore, weekly: null, allTime: null };
  }

  const saved = await saveArcadeScore(GUSTY_SNAKE_GAME_ID, user.id, run);
  if (!saved.ok) {
    console.error("[arcade] no se pudo guardar el puntaje", { userId: user.id, error: saved.error });
    return { ok: false, error: "No pudimos guardar el puntaje. Probá de nuevo." };
  }

  const [weekly, allTime, bestScore] = await Promise.all([
    getLeaderboard(supabase, GUSTY_SNAKE_GAME_ID, "weekly"),
    getLeaderboard(supabase, GUSTY_SNAKE_GAME_ID, "all"),
    getPersonalBest(supabase, GUSTY_SNAKE_GAME_ID, user.id),
  ]);

  revalidatePath(`/arcade/${GUSTY_SNAKE_GAME_ID}`);
  revalidatePath(`/arcade/${GUSTY_SNAKE_GAME_ID}/ranking`);

  return {
    ok: true,
    saved: true,
    bestScore,
    weekly: weekly.ok ? findRank(weekly.entries, user.id) : null,
    allTime: allTime.ok ? findRank(allTime.entries, user.id) : null,
  };
}
