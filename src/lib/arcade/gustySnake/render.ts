// Dibujo de Gusty Snake en un <canvas> 2D. Solo dibuja: no sabe de reglas, de
// tiempo ni de React; recibe el estado del motor y un progreso (0–1) para
// animar el paso de un movimiento al siguiente.
//
// El motor avanza a saltos de una celda; para que se vea fluido la serpiente
// se dibuja interpolada entre el estado anterior y el actual. Eso hace que lo
// que se ve vaya un movimiento "atrasado" respecto de la lógica, lo cual juega
// a favor: la cabeza se ve llegar a la última celda antes de morir en vez de
// meterse en la pared.

import type { GustySnakeConfig } from "./config";
import { GUSTY_SNAKE_HEAD_ORIENTATION } from "./assets";
import type { Direction, GameState, Point } from "./engine";
import type { Scenario } from "./scenarios";

export interface RenderAssets {
  head: HTMLImageElement | null;
  food: HTMLImageElement | null;
  /** Fondo opcional del escenario. */
  background?: HTMLImageElement | null;
}

export interface Frame {
  state: GameState;
  /** Estado anterior al último movimiento. */
  previous: GameState;
  /** Avance hacia el próximo movimiento, de 0 a 1. */
  progress: number;
  /** Reloj en milisegundos (para la pulsación de la patita). */
  time: number;
  /** Milisegundos desde que apareció la patita actual. */
  foodAge: number;
  /** Intensidad del destello rojo al morir, de 0 a 1. */
  deathFlash: number;
}

const POP_IN_MS = 240;
const PULSE_PERIOD_MS = 1100;
const HEAD_SIZE_CELLS = 1.6;
const FOOD_SIZE_CELLS = 1.18;

const TILT_RADIANS = (10 * Math.PI) / 180;
const ROTATION: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: (3 * Math.PI) / 2,
};

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Entra con un pequeño rebote. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private background: HTMLCanvasElement | null = null;
  private dpr = 1;
  private cell = 0;

  assets: RenderAssets = { head: null, food: null };
  /** Con "reducir movimiento" no hay pulsación ni rebote de la patita. */
  reducedMotion = false;
  /** true si la imagen de la cabeza es una foto cuadrada que se recorta en círculo. */
  clipHeadToCircle = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: GustySnakeConfig,
    private readonly scenario: Scenario,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador no soporta canvas 2D.");
    this.ctx = ctx;
  }

  /**
   * Ajusta el canvas al espacio disponible conservando la proporción del
   * tablero. La celda mide un número entero de píxeles físicos para que las
   * líneas queden nítidas. Devuelve el tamaño final en píxeles CSS.
   */
  resize(availableWidth: number, availableHeight: number, maxCellPx = 36) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { cols, rows } = this.config;
    const rawCell = Math.min(availableWidth / cols, availableHeight / rows, maxCellPx);
    const cell = Math.max(4, Math.floor(rawCell * dpr) / dpr);
    const width = cell * cols;
    const height = cell * rows;

    this.dpr = dpr;
    this.cell = cell;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background = null; // se vuelve a armar en el próximo dibujo
    return { width, height };
  }

  /** Cambia las imágenes; fuerza rearmar el fondo si cambió. */
  setAssets(assets: RenderAssets) {
    if (assets.background !== this.assets.background) this.background = null;
    this.assets = assets;
  }

  draw(frame: Frame) {
    if (this.cell === 0) return; // todavía sin tamaño
    const { ctx } = this;
    if (!this.background) this.background = this.buildBackground();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawFood(frame);
    this.drawSnake(frame);

    if (frame.deathFlash > 0) {
      ctx.fillStyle = `rgba(220, 38, 38, ${0.4 * frame.deathFlash})`;
      ctx.fillRect(0, 0, this.config.cols * this.cell, this.config.rows * this.cell);
    }
  }

  // ── Fondo: damero sutil + imagen opcional + cuadrícula. Se dibuja una vez. ──
  private buildBackground(): HTMLCanvasElement {
    const { cols, rows } = this.config;
    const { cell, dpr, scenario } = this;
    const layer = document.createElement("canvas");
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const g = layer.getContext("2d");
    if (!g) return layer;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = scenario.cellColors[(x + y) % 2];
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    const image = this.assets.background;
    if (image && image.naturalWidth > 0) {
      // "cover": llena el tablero sin deformar la imagen.
      const width = cols * cell;
      const height = rows * cell;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      g.globalAlpha = 0.55;
      g.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      g.globalAlpha = 1;
    }

    g.strokeStyle = scenario.gridColor;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < cols; x++) {
      g.moveTo(x * cell, 0);
      g.lineTo(x * cell, rows * cell);
    }
    for (let y = 1; y < rows; y++) {
      g.moveTo(0, y * cell);
      g.lineTo(cols * cell, y * cell);
    }
    g.stroke();
    return layer;
  }

  // ── Patita de pollo ──
  private drawFood({ state, previous, progress, time, foodAge }: Frame) {
    // La patita que se acaba de comer se achica mientras la cabeza llega (el
    // motor ya la sacó, pero lo que se ve va un movimiento atrasado).
    if (state.ate && previous.food) {
      this.drawDrumstick(previous.food, Math.max(0, 1 - progress * 1.25));
    }
    if (state.food) {
      const entering = this.reducedMotion ? 1 : easeOutBack(Math.min(1, foodAge / POP_IN_MS));
      const pulse = this.reducedMotion
        ? 1
        : 1 + 0.07 * Math.sin((time / PULSE_PERIOD_MS) * Math.PI * 2);
      this.drawDrumstick(state.food, entering * pulse);
    }
  }

  private drawDrumstick(cellPoint: Point, scale: number) {
    if (scale <= 0) return;
    const { ctx, cell } = this;
    const cx = (cellPoint.x + 0.5) * cell;
    const cy = (cellPoint.y + 0.5) * cell;
    const size = cell * FOOD_SIZE_CELLS * scale;

    const image = this.assets.food;
    if (image && image.naturalWidth > 0) {
      ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
      return;
    }

    // Respaldo vectorial (si la imagen no cargó): una patita simple.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "#c8741f";
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.12, size * 0.27, size * 0.33, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5ecd7";
    ctx.fillRect(-size * 0.06, size * 0.1, size * 0.12, size * 0.3);
    ctx.beginPath();
    ctx.arc(-size * 0.09, size * 0.43, size * 0.09, 0, Math.PI * 2);
    ctx.arc(size * 0.09, size * 0.43, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Serpiente: cuerpo como un tubo redondeado + cabeza con la cara de Gusty ──
  private drawSnake({ state, previous, progress }: Frame) {
    const { ctx, cell, scenario } = this;
    const head = lerp(previous.snake[0], state.snake[0], progress);
    const tail = lerp(
      previous.snake[previous.snake.length - 1],
      state.snake[state.snake.length - 1],
      progress,
    );
    // Cabeza interpolada → resto de las celdas del estado actual → cola
    // interpolada. La cola que se va corriendo queda alineada con su celda.
    const points = [head, ...state.snake.slice(1), tail];

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = (point.x + 0.5) * cell;
      const y = (point.y + 0.5) * cell;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const bodyWidth = cell * 0.72;
    ctx.strokeStyle = scenario.snake.bodyEdge;
    ctx.lineWidth = bodyWidth + Math.max(2, cell * 0.12);
    ctx.stroke();
    ctx.strokeStyle = scenario.snake.body;
    ctx.lineWidth = bodyWidth;
    ctx.stroke();
    ctx.strokeStyle = scenario.snake.bodyHighlight;
    ctx.lineWidth = bodyWidth * 0.34;
    ctx.stroke();

    this.drawHead(head, state.direction);
  }

  private drawHead(position: Point, direction: Direction) {
    const { ctx, cell } = this;
    const cx = (position.x + 0.5) * cell;
    const cy = (position.y + 0.5) * cell;
    const size = cell * HEAD_SIZE_CELLS;

    // Disco claro detrás: la cabeza tiene que destacar del cuerpo verde.
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    if (GUSTY_SNAKE_HEAD_ORIENTATION === "rotate") {
      ctx.rotate(ROTATION[direction]);
    } else if (direction === "right") {
      ctx.rotate(TILT_RADIANS);
    } else if (direction === "left") {
      ctx.scale(-1, 1);
      ctx.rotate(TILT_RADIANS);
    }

    const image = this.assets.head;
    if (image && image.naturalWidth > 0) {
      if (this.clipHeadToCircle) {
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      this.drawFallbackFace(size);
    }
    ctx.restore();

    // Aro para separar la cabeza del cuerpo.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = Math.max(1.5, cell * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Carita simple, para cuando la imagen de la cabeza todavía no cargó. */
  private drawFallbackFace(size: number) {
    const { ctx } = this;
    ctx.fillStyle = "#f6c945";
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a10";
    ctx.beginPath();
    ctx.arc(-size * 0.15, -size * 0.08, size * 0.06, 0, Math.PI * 2);
    ctx.arc(size * 0.15, -size * 0.08, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2a10";
    ctx.lineWidth = size * 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, size * 0.04, size * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}
