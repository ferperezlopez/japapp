// Validación de lo que el navegador manda al terminar una partida. Es lógica
// pura (sin base de datos ni sesión) para poder probarla a fondo: la server
// action (actions.ts) solo agrega "quién es el usuario" y "guardar en la base".
//
// Nada de lo que llega se toma como cierto: se valida la forma, se vuelve a
// jugar la partida con el mismo motor y se comparan los números declarados
// contra los recalculados.

import type { GustySnakeConfig } from "./config";
import { parseReplay, verifyReplay, type Replay } from "./replay";

/** Mismo tope que el check de la tabla arcade_scores (24 h). */
export const MAX_DURATION_MS = 86_400_000;

/**
 * Margen para el redondeo de la duración que mide el navegador. Mucho menor
 * que un intervalo entre movimientos (≥ 90 ms): no deja pasar nada que no sea
 * ruido de medición.
 */
export const DURATION_TOLERANCE_MS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ValidatedRun {
  /** Identificador de la partida, generado por el navegador (idempotencia). */
  clientRunId: string;
  replay: Replay;
  /** Puntaje RECALCULADO por el servidor (coincide con el declarado). */
  score: number;
  durationMs: number;
  ticks: number;
  /** true si la partida terminó chocando; false si se abandonó antes. */
  over: boolean;
}

export type ValidateSubmissionResult =
  | { ok: true; run: ValidatedRun }
  | { ok: false; error: string };

export function validateSubmission(
  input: unknown,
  config: GustySnakeConfig,
): ValidateSubmissionResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Datos de la partida inválidos." };
  }
  const { clientRunId, replay, score, durationMs } = input as Record<string, unknown>;

  if (typeof clientRunId !== "string" || !UUID.test(clientRunId)) {
    return { ok: false, error: "Identificador de partida inválido." };
  }
  if (!Number.isInteger(score) || (score as number) < 0) {
    return { ok: false, error: "Puntaje inválido." };
  }
  if (
    !Number.isInteger(durationMs) ||
    (durationMs as number) < 0 ||
    (durationMs as number) > MAX_DURATION_MS
  ) {
    return { ok: false, error: "Duración inválida." };
  }

  const parsed = parseReplay(replay);
  if (!parsed.ok) return parsed;

  const verified = verifyReplay(config, parsed.replay);
  if (!verified.ok) return verified;

  if (verified.score !== score) {
    return { ok: false, error: "El puntaje no coincide con la partida jugada." };
  }
  if ((durationMs as number) + DURATION_TOLERANCE_MS < verified.minDurationMs) {
    return { ok: false, error: "La duración es imposible para esa partida." };
  }

  return {
    ok: true,
    run: {
      clientRunId: clientRunId.toLowerCase(),
      replay: parsed.replay,
      score: verified.score,
      durationMs: durationMs as number,
      ticks: verified.ticks,
      over: verified.over,
    },
  };
}
