// Registro de una partida (replay) y su verificación en el servidor.
//
// El navegador NO manda "saqué 120 puntos" y listo: manda la semilla del
// generador de patitas y los giros que hizo la serpiente. El servidor vuelve a
// jugar la partida con el MISMO motor (engine.ts) y recalcula el puntaje: si
// no coincide con el declarado, o si el registro es imposible (giro de 180°,
// movimientos después de morir, otra versión de las reglas), se rechaza.
// Editar un número en DevTools ya no sirve: hay que presentar una partida
// jugable. (Lo que esto NO impide es un bot que juegue de verdad: ver
// specs/020-japarcade-gusty-snake.md.)

import type { GustySnakeConfig } from "./config";
import {
  DIRECTIONS,
  createInitialState,
  intervalForScore,
  step,
  turn,
  type GameOverReason,
} from "./engine";

// `type` y no `interface` a propósito: un alias de objeto se puede asignar a
// la columna jsonb (tipo Json) sin casts; una interface, no.
export type Replay = {
  /** GustySnakeConfig.version con la que se jugó. */
  v: number;
  /** Semilla del generador de patitas: entero de 32 bits sin signo. */
  seed: number;
  /** Movimientos hechos, incluido el fatal si la partida terminó chocando. */
  ticks: number;
  /**
   * Giros efectivos: [número de movimiento (desde 0), código de dirección
   * (índice en DIRECTIONS)], en orden estrictamente creciente. El giro del
   * movimiento N se aplica justo antes de ese movimiento.
   */
  turns: [number, number][];
};

/**
 * Error de verifyReplay cuando el replay es de otra versión del juego. Es una
 * constante porque la server action lo distingue del resto para avisarle a
 * quien tiene la app vieja abierta que recargue.
 */
export const STALE_VERSION_ERROR = "La versión del juego no coincide.";

/**
 * Tope de movimientos de un replay (≈2,5 h de juego a la velocidad inicial):
 * acota el trabajo del servidor al volver a simular. Una partida real termina
 * mucho antes (chocando) o alcanza la velocidad máxima y se vuelve imposible.
 */
export const MAX_REPLAY_TICKS = 50_000;

export type ParseReplayResult = { ok: true; replay: Replay } | { ok: false; error: string };

/** Valida la FORMA de lo que llega del navegador (no confiar en nada). */
export function parseReplay(input: unknown): ParseReplayResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "El registro de la partida no es un objeto." };
  }
  const { v, seed, ticks, turns } = input as Record<string, unknown>;

  if (!Number.isInteger(v) || (v as number) < 1) {
    return { ok: false, error: "Versión del juego inválida." };
  }
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff) {
    return { ok: false, error: "Semilla inválida." };
  }
  if (!Number.isInteger(ticks) || (ticks as number) < 0 || (ticks as number) > MAX_REPLAY_TICKS) {
    return { ok: false, error: "Cantidad de movimientos inválida." };
  }
  if (!Array.isArray(turns) || turns.length > (ticks as number)) {
    return { ok: false, error: "Lista de giros inválida." };
  }

  const parsedTurns: [number, number][] = [];
  let previousTick = -1;
  for (const entry of turns) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return { ok: false, error: "Giro mal formado." };
    }
    const [tick, code] = entry as unknown[];
    if (!Number.isInteger(tick) || !Number.isInteger(code)) {
      return { ok: false, error: "Giro mal formado." };
    }
    if ((tick as number) <= previousTick || (tick as number) >= (ticks as number)) {
      return { ok: false, error: "Giros fuera de orden o fuera de la partida." };
    }
    if ((code as number) < 0 || (code as number) >= DIRECTIONS.length) {
      return { ok: false, error: "Dirección inválida." };
    }
    parsedTurns.push([tick as number, code as number]);
    previousTick = tick as number;
  }

  return {
    ok: true,
    replay: { v: v as number, seed: seed as number, ticks: ticks as number, turns: parsedTurns },
  };
}

export type VerifyReplayResult =
  | {
      ok: true;
      /** Puntaje recalculado por el servidor. */
      score: number;
      ticks: number;
      /** La serpiente chocó (o llenó el tablero) en el último movimiento. */
      over: boolean;
      overReason: GameOverReason | null;
      /**
       * Lo MÍNIMO que puede haber durado la partida, sumando el tiempo entre
       * movimientos de la curva de velocidad. Nadie juega más rápido que eso.
       */
      minDurationMs: number;
    }
  | { ok: false; error: string };

/** Vuelve a jugar la partida y devuelve lo que realmente pasó. */
export function verifyReplay(config: GustySnakeConfig, replay: Replay): VerifyReplayResult {
  if (replay.v !== config.version) {
    return { ok: false, error: STALE_VERSION_ERROR };
  }

  let state = createInitialState(config, replay.seed);
  let minDurationMs = 0;
  let nextTurn = 0;

  for (let i = 0; i < replay.ticks; i++) {
    if (state.status === "over") {
      return { ok: false, error: "El registro sigue después de terminada la partida." };
    }

    const scheduled = replay.turns[nextTurn];
    if (scheduled !== undefined && scheduled[0] === i) {
      const turned = turn(state, DIRECTIONS[scheduled[1]]);
      if (!turned) return { ok: false, error: `Giro inválido en el movimiento ${i}.` };
      state = turned;
      nextTurn++;
    }

    // Antes de cada movimiento se espera el intervalo que corresponde al
    // puntaje que ya se tenía (mismo criterio que el runner del navegador).
    minDurationMs += intervalForScore(state.score, config);
    state = step(state, config);
  }

  if (nextTurn !== replay.turns.length) {
    return { ok: false, error: "Quedaron giros sin aplicar." };
  }

  return {
    ok: true,
    score: state.score,
    ticks: state.ticks,
    over: state.status === "over",
    overReason: state.overReason,
    minDurationMs,
  };
}
