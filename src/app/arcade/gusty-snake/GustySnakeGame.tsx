"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { GUSTY_SNAKE_ASSETS } from "@/lib/arcade/gustySnake/assets";
import { GUSTY_SNAKE_GAME_ID } from "@/lib/arcade/gustySnake/config";
import type { GameOverReason } from "@/lib/arcade/gustySnake/engine";
import { attachKeyboardControls, attachSwipeControls } from "@/lib/arcade/gustySnake/input";
import {
  GustySnakeRunner,
  type RunResult,
  type RunnerPhase,
} from "@/lib/arcade/gustySnake/runner";
import type { SubmitScoreResult } from "@/lib/arcade/types";
import { submitGustyScore } from "./actions";

type SubmitState =
  | { status: "saving" }
  | { status: "done"; response: Extract<SubmitScoreResult, { ok: true }> }
  | { status: "error"; message: string };

const RANKING_HREF = `/arcade/${GUSTY_SNAKE_GAME_ID}/ranking`;

const GAME_NAME = "Gusty Glotón";

/**
 * Cuánto se espera antes de tapar el tablero con la pantalla de game over:
 * alcanza para ver cómo termina (el destello y la cara de Gusty muerto; con el
 * queso, también el efecto verdoso).
 */
const OVER_DELAY_MS = 550;
const OVER_DELAY_CHEESE_MS = 850;

/** El título del game over según cómo terminó la partida. */
const OVER_TITLES: Record<GameOverReason, string> = {
  wall: "¡Gusty se la puso!",
  self: "¡Gusty se la puso!",
  cheese: "¡El queso pudo más que Gusty!",
  full: "¡Gusty se comió todo!",
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null); // sin imagen se dibuja un respaldo vectorial
    image.src = src;
  });
}

/**
 * Mientras `active` (se está jugando), el botón "atrás" del celular pausa en
 * vez de sacarte del juego y perder la partida. Empuja una entrada de
 * historial al empezar a jugar y, si "atrás" la saca, pausa.
 *
 * Si el juego sale de "jugando" por otra vía (botón de pausa, game over), la
 * entrada se consume con un history.back() para no dejar una entrada fantasma
 * (un "atrás" que no hace nada). Ese back se hace DESPUÉS, y solo si seguimos
 * parados sobre nuestra entrada: si lo que cerró el guard fue una navegación
 * (por ejemplo tocar un link del menú en plena partida), Next ya empujó su
 * propia entrada y un history.back() acá pelearía con esa navegación.
 */
function useBackToPause(active: boolean, onPause: () => void) {
  const onPauseRef = useRef(onPause);
  const nextGuardId = useRef(0);
  // history.back() es asíncrono: su popstate puede llegar cuando ya hay un
  // guard nuevo escuchando (pausar y reanudar casi a la vez). Se cuentan los
  // "atrás" programáticos para no confundirlos con uno del usuario.
  const programmaticBacks = useRef(0);
  useEffect(() => {
    onPauseRef.current = onPause;
  });

  useEffect(() => {
    if (!active) return;
    // Cada entrada lleva su propio id: si se pausa y se reanuda enseguida, el
    // back diferido de la entrada vieja no tiene que consumir la nueva.
    const guardId = ++nextGuardId.current;
    window.history.pushState({ arcadeGuard: guardId }, "");
    let poppedByUser = false;
    const onPopState = () => {
      if (programmaticBacks.current > 0) {
        programmaticBacks.current--;
        return;
      }
      poppedByUser = true;
      onPauseRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (poppedByUser) return;
      setTimeout(() => {
        if (window.history.state?.arcadeGuard !== guardId) return;
        programmaticBacks.current++;
        window.history.back();
        // Si por algún motivo el popstate no llega, no se queda "debiendo" uno.
        setTimeout(() => {
          programmaticBacks.current = Math.max(0, programmaticBacks.current - 1);
        }, 500);
      }, 0);
    };
  }, [active]);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
      <p className="font-heading text-2xl leading-none tabular-nums">{value}</p>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Overlay({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 p-3"
    >
      <div className="max-h-full w-full max-w-[17.5rem] overflow-y-auto rounded-2xl bg-background p-4 text-center shadow-xl">
        {children}
      </div>
    </div>
  );
}

export function GustySnakeGame({ personalBest }: { personalBest: number }) {
  const [phase, setPhase] = useState<RunnerPhase>("idle");
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [bestFromServer, setBestFromServer] = useState(0);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [finished, setFinished] = useState<{ result: RunResult; previousBest: number } | null>(
    null,
  );
  const [submit, setSubmit] = useState<SubmitState | null>(null);
  const [, startTransition] = useTransition();

  // El game over se muestra recién pasado un instante (ver OVER_DELAY_MS). Se
  // guarda de qué partida es, así no hace falta "apagarlo" al empezar otra.
  const [overShownFor, setOverShownFor] = useState<RunResult | null>(null);

  const best = Math.max(personalBest, bestFromServer);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<GustySnakeRunner | null>(null);
  const bestRef = useRef(best);
  const submitSeq = useRef(0);

  useEffect(() => {
    bestRef.current = best;
  }, [best]);

  // Guarda la partida en el servidor. `silent`: una partida abandonada se
  // guarda sin mostrar nada (la pantalla ya volvió al inicio).
  const send = useCallback(
    (result: RunResult, silent: boolean) => {
      const seq = ++submitSeq.current;
      // Una partida en 0 no entra al ranking: no hay nada que guardar.
      if (result.score <= 0) {
        if (!silent) setSubmit(null);
        return;
      }
      if (!silent) setSubmit({ status: "saving" });

      startTransition(async () => {
        let response: SubmitScoreResult;
        try {
          response = await submitGustyScore({
            clientRunId: result.clientRunId,
            replay: result.replay,
            score: result.score,
            durationMs: result.durationMs,
          });
        } catch {
          response = {
            ok: false,
            error: "No pudimos guardar el puntaje. Revisá tu conexión y probá de nuevo.",
          };
        }

        if (response.ok) {
          setBestFromServer((current) => Math.max(current, response.bestScore));
        }
        // Si ya empezó otra partida, la respuesta de esta no pisa la pantalla.
        if (silent || seq !== submitSeq.current) return;
        setSubmit(
          response.ok
            ? { status: "done", response }
            : { status: "error", message: response.error },
        );
      });
    },
    [startTransition],
  );

  const handleFinish = useCallback(
    (result: RunResult) => {
      if (result.over) setFinished({ result, previousBest: bestRef.current });
      send(result, !result.over);
    },
    [send],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (!canvas || !area) return;

    const runner = new GustySnakeRunner(canvas, {
      onPhaseChange: setPhase,
      onScoreChange: setScore,
      onCountdown: setCountdown,
      onFinish: handleFinish,
    });
    runnerRef.current = runner;

    const stopSwipe = attachSwipeControls(canvas, (direction) => runner.queueDirection(direction));
    const stopKeys = attachKeyboardControls({
      onDirection: (direction) => runner.queueDirection(direction),
      onTogglePause: () => runner.togglePause(),
    });

    // El tablero ocupa todo el espacio libre sin deformarse.
    const observer = new ResizeObserver(() => {
      setBoardSize(runner.resize(area.clientWidth, area.clientHeight));
    });
    observer.observe(area);

    let cancelled = false;
    const { heads, foods, cheese } = GUSTY_SNAKE_ASSETS;
    Promise.all([
      loadImage(heads.normal.src),
      loadImage(heads.happy.src),
      loadImage(heads.dead.src),
      loadImage(foods.olive.src),
      loadImage(foods.empanada.src),
      loadImage(foods.drumstick.src),
      loadImage(cheese.src),
    ]).then(([normal, happy, dead, olive, empanada, drumstick, cheeseImage]) => {
      if (cancelled) return;
      runner.setAssets({
        heads: {
          normal: normal && { image: normal, face: heads.normal.face },
          happy: happy && { image: happy, face: heads.happy.face },
          dead: dead && { image: dead, face: heads.dead.face },
        },
        foods: { olive, empanada, drumstick },
        cheese: cheeseImage,
      });
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      stopSwipe();
      stopKeys();
      runner.destroy();
      runnerRef.current = null;
    };
  }, [handleFinish]);

  useEffect(() => {
    if (phase !== "over" || !finished) return;
    const delay = finished.result.overReason === "cheese" ? OVER_DELAY_CHEESE_MS : OVER_DELAY_MS;
    const timer = setTimeout(() => setOverShownFor(finished.result), delay);
    return () => clearTimeout(timer);
  }, [phase, finished]);
  const overVisible = phase === "over" && finished !== null && overShownFor === finished.result;

  const play = () => {
    submitSeq.current++; // descarta respuestas pendientes de una partida anterior
    setFinished(null);
    setSubmit(null);
    runnerRef.current?.start();
  };

  const isPlaying = phase === "playing" || phase === "countdown";
  useBackToPause(isPlaying, () => runnerRef.current?.pause());

  const canPause = isPlaying || phase === "paused";
  const isRecord = finished !== null && finished.result.score > finished.previousBest;

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ height: "calc(100dvh - 4.25rem)" }}
    >
      <div className="mb-3 flex items-stretch gap-2">
        <div className="grid flex-1 grid-cols-2 gap-4 rounded-xl border border-surface-border bg-surface px-4 py-2">
          <Stat label="Puntos" value={score} />
          <Stat label="Récord" value={Math.max(best, score)} />
        </div>
        <button
          type="button"
          disabled={!canPause}
          onClick={() => runnerRef.current?.togglePause()}
          aria-label={phase === "paused" ? "Continuar" : "Pausar"}
          className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface text-foreground/70 transition duration-200 hover:bg-brand-soft hover:text-brand active:scale-95 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-foreground/70"
        >
          {phase === "paused" ? <PlayIcon /> : <PauseIcon />}
        </button>
      </div>

      {/* touch-action: none → deslizar sobre el tablero no mueve la página. */}
      <div ref={areaRef} className="relative min-h-0 flex-1 touch-none select-none">
        {/* Pegado al marcador (arriba), no centrado: sin un hueco en el medio. */}
        <div
          className="absolute inset-x-0 top-0 mx-auto"
          style={{ width: boardSize.width, height: boardSize.height }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Tablero de ${GAME_NAME}`}
            className="block touch-none rounded-xl border border-black/30 shadow-lg"
          />

          {phase === "countdown" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                key={countdown}
                className="animate-reveal font-heading text-8xl font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              >
                {countdown}
              </span>
            </div>
          )}

          {phase === "idle" && (
            <Overlay label={GAME_NAME}>
              <h1 className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- sprite estático de /public */}
                <img
                  src={GUSTY_SNAKE_ASSETS.logo.src}
                  alt={GAME_NAME}
                  width={GUSTY_SNAKE_ASSETS.logo.width}
                  height={GUSTY_SNAKE_ASSETS.logo.height}
                  className="h-auto w-full max-w-[13.5rem] [@media(max-height:640px)]:max-w-[9.5rem]"
                />
              </h1>
              <p className="mt-2 font-heading text-lg font-semibold leading-tight [@media(max-height:640px)]:text-base">
                Come de todo. Menos queso.
              </p>
              <p className="mt-3 text-sm text-foreground/60">
                Tu mejor puntuación{" "}
                <span className="font-semibold tabular-nums text-brand">{best}</span>
              </p>
              <Button
                onClick={play}
                className="mt-3 w-full justify-center py-3 text-base [@media(max-height:640px)]:py-2"
              >
                Jugar
              </Button>
              <p className="mt-2 text-xs text-foreground/40 [@media(max-height:640px)]:hidden">
                Deslizá el dedo para girar · flechas en la compu
              </p>
              <div className="mt-3 flex items-center justify-center gap-4 text-sm font-medium">
                <Link href={RANKING_HREF} className="text-brand hover:underline">
                  Ver ranking
                </Link>
                <Link href="/arcade" className="text-foreground/50 hover:underline">
                  JAPArcade
                </Link>
              </div>
            </Overlay>
          )}

          {phase === "paused" && (
            <Overlay label="Juego en pausa">
              <h2 className="font-heading text-2xl font-semibold">En pausa</h2>
              <p className="mt-1 text-sm text-foreground/60">
                {score} {score === 1 ? "punto" : "puntos"}
              </p>
              <Button
                onClick={() => runnerRef.current?.resume()}
                className="mt-4 w-full justify-center py-3 text-base"
              >
                Continuar
              </Button>
              <Button
                variant="secondary"
                onClick={() => runnerRef.current?.abandon()}
                className="mt-2 w-full justify-center"
              >
                Abandonar
              </Button>
              {score > 0 && (
                <p className="mt-2 text-xs text-foreground/40">
                  Si abandonás, se guarda lo que llevás.
                </p>
              )}
            </Overlay>
          )}

          {overVisible && finished && (
            <Overlay label="Fin de la partida">
              {/* eslint-disable-next-line @next/next/no-img-element -- sprite estático de /public */}
              <img
                src={GUSTY_SNAKE_ASSETS.heads.dead.src}
                alt="Gusty, fuera de combate"
                width={256}
                height={256}
                className="mx-auto h-[4.5rem] w-[4.5rem] object-contain [@media(max-height:640px)]:h-14 [@media(max-height:640px)]:w-14"
              />
              <h2 className="mt-1 font-heading text-xl font-semibold leading-tight [@media(max-height:640px)]:text-lg">
                {OVER_TITLES[finished.result.overReason ?? "wall"]}
              </h2>
              <p className="mt-2 font-heading text-5xl font-semibold leading-none tabular-nums text-brand [@media(max-height:640px)]:text-4xl">
                {finished.result.score}
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                {finished.result.score === 1 ? "punto" : "puntos"}
              </p>

              {isRecord ? (
                <p className="mt-3 inline-block rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber-ink">
                  ¡Nuevo récord personal!
                </p>
              ) : (
                finished.previousBest > 0 && (
                  <p className="mt-3 text-sm text-foreground/60">
                    Tu récord: <span className="tabular-nums">{finished.previousBest}</span>
                  </p>
                )
              )}

              <div className="mt-3 min-h-10 text-sm [@media(max-height:640px)]:min-h-8">
                {submit?.status === "saving" && (
                  <p className="flex items-center justify-center gap-2 text-foreground/60">
                    <Spinner /> Guardando tu puntaje...
                  </p>
                )}
                {submit?.status === "done" && submit.response.saved && (
                  <div className="space-y-0.5 text-foreground/70">
                    {submit.response.weekly && (
                      <p>
                        Esta semana: puesto{" "}
                        <span className="font-semibold tabular-nums">
                          {submit.response.weekly.position}
                        </span>{" "}
                        de {submit.response.weekly.total}
                      </p>
                    )}
                    {submit.response.allTime && (
                      <p>
                        Histórico: puesto{" "}
                        <span className="font-semibold tabular-nums">
                          {submit.response.allTime.position}
                        </span>{" "}
                        de {submit.response.allTime.total}
                      </p>
                    )}
                  </div>
                )}
                {submit?.status === "error" && (
                  <div>
                    <p className="text-red-600 dark:text-red-400">{submit.message}</p>
                    <button
                      type="button"
                      onClick={() => send(finished.result, false)}
                      className="mt-1 font-medium text-brand hover:underline"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
              </div>

              <Button
                onClick={play}
                className="mt-3 w-full justify-center py-3 text-base [@media(max-height:640px)]:py-2"
              >
                Jugar de nuevo
              </Button>
              <div className="mt-3 flex items-center justify-center gap-4 text-sm font-medium">
                <Link href="/arcade" className="text-foreground/60 hover:underline">
                  Salir
                </Link>
                <Link href={RANKING_HREF} className="text-brand hover:underline">
                  Ver ranking
                </Link>
              </div>
            </Overlay>
          )}
        </div>
      </div>
    </div>
  );
}
