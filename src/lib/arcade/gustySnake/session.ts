// Una partida en curso: el estado del motor + la cola de giros pendientes +
// el registro de la partida (replay). Sigue siendo TypeScript puro y sin
// reloj: quien maneja el tiempo (el runner del navegador) decide CUÁNDO llamar
// a tick(); la sesión solo decide QUÉ pasa en cada movimiento.
//
// Grabar el replay acá (y no en el componente de React) garantiza que lo que
// se manda al servidor es exactamente lo que el motor hizo: el servidor lo
// vuelve a simular y tiene que dar el mismo puntaje (ver replay.ts).

import type { GustySnakeConfig } from "./config";
import {
  DIRECTIONS,
  OPPOSITE,
  createInitialState,
  intervalForScore,
  step,
  turn,
  type Direction,
  type GameState,
} from "./engine";
import type { Replay } from "./replay";

/**
 * Giros que se pueden dejar en espera entre dos movimientos. Con la serpiente
 * a 90–180 ms por movimiento, un par de deslizamientos rápidos seguidos
 * (arriba y enseguida izquierda) caen dentro del mismo movimiento: se encolan
 * y se aplican uno por movimiento, en orden, en vez de perderse.
 */
export const MAX_QUEUED_TURNS = 3;

export class GustySession {
  readonly config: GustySnakeConfig;
  readonly seed: number;

  private current: GameState;
  private before: GameState;
  private queue: Direction[] = [];
  private turns: [number, number][] = [];

  constructor(config: GustySnakeConfig, seed: number) {
    this.config = config;
    this.seed = seed >>> 0;
    this.current = createInitialState(config, this.seed);
    this.before = this.current;
  }

  /** Estado actual de la partida. */
  get state(): GameState {
    return this.current;
  }

  /** Estado antes del último movimiento (el render lo usa para interpolar). */
  get previousState(): GameState {
    return this.before;
  }

  /** Milisegundos hasta el próximo movimiento, según el puntaje actual. */
  get intervalMs(): number {
    return intervalForScore(this.current.score, this.config);
  }

  /**
   * Encola un cambio de dirección para el próximo movimiento. Devuelve false
   * si se descartó: misma dirección que la última, giro de 180° respecto de
   * la última (la pendiente, o la actual si no hay), cola llena o partida
   * terminada.
   */
  queueDirection(direction: Direction): boolean {
    if (this.current.status === "over") return false;
    const last = this.queue.length > 0 ? this.queue[this.queue.length - 1] : this.current.direction;
    if (direction === last || direction === OPPOSITE[last]) return false;
    if (this.queue.length >= MAX_QUEUED_TURNS) return false;
    this.queue.push(direction);
    return true;
  }

  /** Un movimiento: aplica el próximo giro en espera (si hay) y avanza. */
  tick(): GameState {
    if (this.current.status === "over") return this.current;

    let state = this.current;
    const queued = this.queue.shift();
    if (queued !== undefined) {
      const turned = turn(state, queued);
      if (turned) {
        this.turns.push([state.ticks, DIRECTIONS.indexOf(queued)]);
        state = turned;
      }
    }

    this.before = this.current;
    this.current = step(state, this.config);
    return this.current;
  }

  /** Registro de la partida hasta ahora, listo para mandar al servidor. */
  getReplay(): Replay {
    return {
      v: this.config.version,
      seed: this.seed,
      ticks: this.current.ticks,
      turns: this.turns.map(([tick, code]): [number, number] => [tick, code]),
    };
  }
}
