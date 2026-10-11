// El "reloj" de Gusty Snake en el navegador: maneja el bucle de animación, la
// cuenta regresiva, la pausa (incluida la automática al perder visibilidad) y
// le dice a la sesión CUÁNDO mover la serpiente. Las reglas están en el motor
// (engine/session) y el dibujo en render.ts; React solo escucha los eventos.
//
// Tiempo: se usa un acumulador. Cada cuadro suma el tiempo transcurrido y,
// cuando alcanza el intervalo de la velocidad actual, hace un movimiento. Así
// el juego no depende de setInterval (que se desfasa) y pausar es simplemente
// no sumar: el estado queda congelado tal cual, incluso a mitad de un paso.

import { GUSTY_SNAKE_CONFIG, type GustySnakeConfig } from "./config";
import type { Direction } from "./engine";
import { BoardRenderer, type Frame, type RenderAssets } from "./render";
import type { Replay } from "./replay";
import { DEFAULT_SCENARIO, type Scenario } from "./scenarios";
import { GustySession } from "./session";

export type RunnerPhase = "idle" | "countdown" | "playing" | "paused" | "over";

export interface RunResult {
  /** Identificador de la partida: reintentar el guardado no la duplica. */
  clientRunId: string;
  replay: Replay;
  score: number;
  /** Tiempo de juego efectivo (sin pausas ni cuenta regresiva), en ms. */
  durationMs: number;
  /** true si terminó chocando; false si se abandonó. */
  over: boolean;
}

export interface RunnerEvents {
  onPhaseChange(phase: RunnerPhase): void;
  onScoreChange(score: number): void;
  onCountdown(value: number): void;
  /** La partida terminó: chocó (over) o se abandonó con puntaje. */
  onFinish(result: RunResult): void;
}

const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 500;
/** Una pestaña dormida no hace "saltar" a la serpiente al despertar. */
const MAX_FRAME_MS = 100;
const MAX_TICKS_PER_FRAME = 4;
const DEATH_FLASH_MS = 450;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function randomRunId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID: UUID v4 a mano.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class GustySnakeRunner {
  private readonly renderer: BoardRenderer;
  /** Partida "de vitrina" para mostrar el tablero antes de empezar. */
  private readonly preview: GustySession;

  private session: GustySession | null = null;
  private phase: RunnerPhase = "idle";
  private runId = "";
  private rafId: number | null = null;
  private lastFrame = 0;
  private accumulatorMs = 0;
  private elapsedMs = 0;
  private countdownLeftMs = 0;
  private countdownShown = 0;
  private foodSince = 0;
  private deathAt = 0;
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly events: RunnerEvents,
    private readonly config: GustySnakeConfig = GUSTY_SNAKE_CONFIG,
    scenario: Scenario = DEFAULT_SCENARIO,
  ) {
    this.renderer = new BoardRenderer(canvas, config, scenario);
    this.renderer.reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.preview = new GustySession(config, 1);

    // Pausa automática al perder visibilidad (cambio de pestaña, app en
    // segundo plano, pantalla bloqueada).
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);
  }

  // ── Control desde afuera ──────────────────────────────────────────────

  /** Empieza una partida nueva (con cuenta regresiva). */
  start(): void {
    if (this.destroyed || this.phase === "countdown" || this.phase === "playing") return;
    this.session = new GustySession(this.config, randomSeed());
    this.runId = randomRunId();
    this.accumulatorMs = 0;
    this.elapsedMs = 0;
    this.deathAt = 0;
    this.foodSince = performance.now();
    this.events.onScoreChange(0);
    this.beginCountdown();
  }

  pause(): void {
    if (this.destroyed) return;
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    this.stopLoop();
    this.setPhase("paused");
    this.drawNow();
  }

  /** Sigue desde donde estaba, con una cuenta regresiva corta. */
  resume(): void {
    if (this.destroyed || this.phase !== "paused") return;
    this.beginCountdown();
  }

  togglePause(): void {
    if (this.phase === "paused") this.resume();
    else this.pause();
  }

  /** Deja la partida a medias: se guarda el puntaje logrado (si es > 0). */
  abandon(): void {
    if (this.destroyed || !this.session) return;
    if (this.phase !== "playing" && this.phase !== "countdown" && this.phase !== "paused") return;
    this.stopLoop();
    const result = this.buildResult(false);
    this.session = null;
    this.setPhase("idle");
    this.events.onScoreChange(0);
    this.drawNow();
    if (result.score > 0) this.events.onFinish(result);
  }

  /** Un giro pedido por el jugador (deslizamiento o flecha). */
  queueDirection(direction: Direction): void {
    // También durante la cuenta regresiva: se puede elegir hacia dónde arrancar.
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    this.session?.queueDirection(direction);
  }

  /** Ajusta el canvas al espacio disponible; devuelve su tamaño final (px CSS). */
  resize(availableWidth: number, availableHeight: number): { width: number; height: number } {
    const size = this.renderer.resize(availableWidth, availableHeight);
    if (!this.destroyed) this.drawNow();
    return size;
  }

  setAssets(assets: RenderAssets, clipHeadToCircle: boolean): void {
    if (this.destroyed) return;
    this.renderer.clipHeadToCircle = clipHeadToCircle;
    this.renderer.setAssets(assets);
    this.drawNow();
  }

  /** Saca el bucle y los listeners. Llamar al desmontar. */
  destroy(): void {
    this.destroyed = true;
    this.stopLoop();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.onPageHide);
  }

  // ── Internos ──────────────────────────────────────────────────────────

  private onVisibilityChange = () => {
    if (document.hidden) this.pause();
  };

  private onPageHide = () => {
    this.pause();
  };

  private setPhase(phase: RunnerPhase): void {
    if (this.destroyed || this.phase === phase) return;
    this.phase = phase;
    this.events.onPhaseChange(phase);
  }

  private beginCountdown(): void {
    this.countdownLeftMs = COUNTDOWN_FROM * COUNTDOWN_STEP_MS;
    this.countdownShown = COUNTDOWN_FROM;
    this.setPhase("countdown");
    this.events.onCountdown(COUNTDOWN_FROM);
    this.startLoop();
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private stopLoop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private frame = (now: number) => {
    this.rafId = null;
    if (this.destroyed) return;

    const dt = Math.min(Math.max(now - this.lastFrame, 0), MAX_FRAME_MS);
    this.lastFrame = now;

    if (this.phase === "countdown") this.advanceCountdown(dt);
    else if (this.phase === "playing") this.advancePlaying(dt, now);

    this.renderer.draw(this.buildFrame(now));

    const flashing = this.phase === "over" && now - this.deathAt < DEATH_FLASH_MS;
    if (this.phase === "countdown" || this.phase === "playing" || flashing) {
      this.rafId = requestAnimationFrame(this.frame);
    }
  };

  private advanceCountdown(dt: number): void {
    this.countdownLeftMs -= dt;
    if (this.countdownLeftMs <= 0) {
      this.setPhase("playing");
      return;
    }
    const value = Math.ceil(this.countdownLeftMs / COUNTDOWN_STEP_MS);
    if (value !== this.countdownShown) {
      this.countdownShown = value;
      this.events.onCountdown(value);
    }
  }

  private advancePlaying(dt: number, now: number): void {
    const session = this.session;
    if (!session) return;

    this.accumulatorMs += dt;
    this.elapsedMs += dt;

    let ticks = 0;
    while (
      session.state.status === "running" &&
      this.accumulatorMs >= session.intervalMs &&
      ticks < MAX_TICKS_PER_FRAME
    ) {
      this.accumulatorMs -= session.intervalMs;
      const scoreBefore = session.state.score;
      session.tick();
      ticks++;
      if (session.state.ate) this.foodSince = now;
      if (session.state.score !== scoreBefore) this.events.onScoreChange(session.state.score);
    }

    if (session.state.status === "over") {
      this.deathAt = now;
      this.setPhase("over");
      this.events.onFinish(this.buildResult(true));
    }
  }

  private buildResult(over: boolean): RunResult {
    const session = this.session;
    if (!session) throw new Error("No hay una partida en curso.");
    return {
      clientRunId: this.runId,
      replay: session.getReplay(),
      score: session.state.score,
      durationMs: Math.round(this.elapsedMs),
      over,
    };
  }

  private buildFrame(now: number): Frame {
    const session = this.session ?? this.preview;
    // Mientras se juega (o está en pausa) se dibuja a mitad de camino entre el
    // estado anterior y el actual; en cualquier otro momento, el estado final.
    const moving = this.session !== null && this.phase !== "over";
    const progress = moving ? Math.min(1, this.accumulatorMs / session.intervalMs) : 1;
    return {
      state: session.state,
      previous: session.previousState,
      progress,
      time: now,
      foodAge: this.session ? now - this.foodSince : Number.POSITIVE_INFINITY,
      deathFlash:
        this.phase === "over" ? Math.max(0, 1 - (now - this.deathAt) / DEATH_FLASH_MS) : 0,
    };
  }

  private drawNow(): void {
    this.renderer.draw(this.buildFrame(performance.now()));
  }
}
