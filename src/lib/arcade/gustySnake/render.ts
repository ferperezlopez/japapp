// Dibujo de Gusty Glotón en un <canvas> 2D. Solo dibuja: no sabe de reglas, de
// tiempo real ni de React; recibe el estado del motor y un progreso (0–1) para
// animar el paso de un movimiento al siguiente.
//
// El motor avanza a saltos de una celda; para que se vea fluido la serpiente
// se dibuja interpolada entre el estado anterior y el actual. Eso hace que lo
// que se ve vaya un movimiento "atrasado" respecto de la lógica, lo cual juega
// a favor: la cabeza se ve llegar a la última celda antes de morir en vez de
// meterse en la pared. TODA la animación es visual: las colisiones, los
// puntos y el queso se deciden en la grilla (engine.ts).

import { GUSTY_SNAKE_HEAD_ORIENTATION, type FaceBox, type HeadExpression } from "./assets";
import { bodyPoints } from "./bodyPath";
import type { FoodKind, GustySnakeConfig } from "./config";
import type { Direction, GameState, Point } from "./engine";
import type { Scenario } from "./scenarios";
import { intervalForScore } from "./timing";

export interface HeadSprite {
  image: HTMLImageElement;
  /** Dónde está la cara dentro del sprite (fracciones 0–1). */
  face: FaceBox;
}

export interface RenderAssets {
  heads: Record<HeadExpression, HeadSprite | null>;
  foods: Record<FoodKind, HTMLImageElement | null>;
  cheese: HTMLImageElement | null;
  /** Fondo opcional del escenario. */
  background?: HTMLImageElement | null;
}

export const NO_ASSETS: RenderAssets = {
  heads: { normal: null, happy: null, dead: null },
  foods: { olive: null, empanada: null, drumstick: null },
  cheese: null,
};

export interface Frame {
  state: GameState;
  /** Estado anterior al último movimiento. */
  previous: GameState;
  /** Avance hacia el próximo movimiento, de 0 a 1. */
  progress: number;
  /** Reloj visual en milisegundos: solo corre mientras se juega (pulsaciones). */
  time: number;
  /** Milisegundos (visuales) desde que apareció la comida actual. */
  foodAge: number;
  /** Qué cara pone Gusty. */
  expression: HeadExpression;
  /** Avance (0–1) de la cara feliz: el rebote de la cabeza y la hinchazón del cuerpo. */
  happyT: number;
  /** Intensidad (0–1) del destello al morir. */
  deathFlash: number;
}

const POP_IN_MS = 240;
const PULSE_PERIOD_MS = 1100;
const FOOD_BOX_CELLS = 1.22;
const CHEESE_BOX_CELLS = 1.3;
const BODY_WIDTH_CELLS = 0.78;
const HEAD_FACE_CELLS = 1.5;
/** Cuánto más ancho se pone el cuerpo al comer (hinchazón elástica). */
const SWELL = 0.1;
const CHEESE_POP_MS = 260;
/** En el último tramo de su vida el queso titila y se achica hasta desaparecer. */
const CHEESE_BLINK_MS = 1000;
const CHEESE_FADE_MS = 240;

const TILT_RADIANS = (9 * Math.PI) / 180;
const ROTATION: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: (3 * Math.PI) / 2,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  /** Lienzo auxiliar para teñir la cara (solo al morir por el queso). */
  private tint: HTMLCanvasElement | null = null;
  private dpr = 1;
  private cell = 0;
  /** Último lado (1 derecha, -1 izquierda) al que miró: al subir o bajar lo conserva. */
  private facing: 1 | -1 = 1;

  assets: RenderAssets = NO_ASSETS;
  /** Con "reducir movimiento" no hay pulsaciones, rebotes ni aparición animada. */
  reducedMotion = false;

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
    // Cambiar el tamaño del canvas reinicia su contexto.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
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
    this.drawCheese(frame);
    this.drawSnake(frame);

    if (frame.deathFlash > 0) {
      // Rojo al chocar; verdoso al comerse el queso.
      const byCheese = frame.state.overReason === "cheese";
      ctx.fillStyle = byCheese
        ? `rgba(132, 204, 22, ${0.34 * frame.deathFlash})`
        : `rgba(220, 38, 38, ${0.4 * frame.deathFlash})`;
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

  // ── Comida ──
  private drawFood({ state, previous, progress, time, foodAge }: Frame) {
    // La comida que se acaba de comer se achica mientras la cabeza llega (el
    // motor ya la sacó, pero lo que se ve va un movimiento atrasado).
    if (state.ate && previous.food) {
      this.drawFoodSprite(previous.food.kind, previous.food, Math.max(0, 1 - progress * 1.25));
    }
    if (state.food) {
      const entering = this.reducedMotion ? 1 : easeOutBack(Math.min(1, foodAge / POP_IN_MS));
      const pulse = this.reducedMotion
        ? 1
        : 1 + 0.06 * Math.sin((time / PULSE_PERIOD_MS) * Math.PI * 2);
      this.drawFoodSprite(state.food.kind, state.food, entering * pulse);
    }
  }

  private drawFoodSprite(kind: FoodKind, cellPoint: Point, scale: number) {
    if (scale <= 0) return;
    const { ctx, cell } = this;
    const cx = (cellPoint.x + 0.5) * cell;
    const cy = (cellPoint.y + 0.5) * cell;
    const box = cell * FOOD_BOX_CELLS * scale;

    const image = this.assets.foods[kind];
    if (image && image.naturalWidth > 0) {
      // Entra entera en la caja sin deformarse, centrada en su celda.
      const fit = box / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * fit;
      const height = image.naturalHeight * fit;
      ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
      return;
    }
    this.drawFoodFallback(kind, cx, cy, box);
  }

  /** Respaldo vectorial (si la imagen no cargó): una forma simple de cada comida. */
  private drawFoodFallback(kind: FoodKind, cx: number, cy: number, size: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.strokeStyle = "#1a1208";
    if (kind === "olive") {
      ctx.fillStyle = "#7a9a12";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d62828";
      ctx.beginPath();
      ctx.ellipse(-size * 0.1, -size * 0.1, size * 0.14, size * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "empanada") {
      ctx.fillStyle = "#e8a22c";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.46, size * 0.3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.rotate(-Math.PI / 5);
      ctx.fillStyle = "#e88a1a";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.46, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Queso: obstáculo mortal. Entra con rebote, late en rojo y titila al irse. ──
  private drawCheese({ state, progress, time }: Frame) {
    const cheese = state.cheese;
    if (!cheese) return;
    const { ctx, cell } = this;

    // Tiempo de juego "ahora": el del motor más lo que va del paso actual. Una
    // vez terminada la partida el queso se queda quieto, tal como estaba.
    const playing = state.status === "running";
    const interval = intervalForScore(state.score, this.config);
    const gameNow = state.clockMs + (playing ? progress * interval : 0);
    const age = gameNow - cheese.spawnedAtMs;
    const remaining = playing ? cheese.expiresAtMs - gameNow : Number.POSITIVE_INFINITY;

    const pop = this.reducedMotion ? 1 : easeOutBack(clamp01(age / CHEESE_POP_MS));
    const fade = clamp01(remaining / CHEESE_FADE_MS);
    const blinking = remaining < CHEESE_BLINK_MS && !this.reducedMotion;
    const blink = blinking && Math.floor(time / 110) % 2 === 1 ? 0.4 : 1;
    const alpha = blink * fade;
    const scale = pop * (0.35 + 0.65 * fade);
    if (alpha <= 0 || scale <= 0) return;

    const cx = (cheese.x + 0.5) * cell;
    const cy = (cheese.y + 0.5) * cell;
    const beat = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 170);

    // Aura de peligro: un brillo rojo y un aro que late.
    const glow = ctx.createRadialGradient(cx, cy, cell * 0.2, cx, cy, cell * 1.3 * scale);
    glow.addColorStop(0, `rgba(239, 68, 68, ${0.42 * alpha})`);
    glow.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 1.3 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(248, 113, 113, ${(0.45 + 0.3 * beat) * alpha})`;
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * (0.8 + 0.1 * beat) * scale, 0, Math.PI * 2);
    ctx.stroke();

    const image = this.assets.cheese;
    ctx.globalAlpha = alpha;
    if (image && image.naturalWidth > 0) {
      const fit = (cell * CHEESE_BOX_CELLS * scale) / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * fit;
      const height = image.naturalHeight * fit;
      ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
    } else {
      this.drawCheeseFallback(cx, cy, cell * CHEESE_BOX_CELLS * scale);
    }
    ctx.globalAlpha = 1;
  }

  private drawCheeseFallback(cx: number, cy: number, size: number) {
    const { ctx } = this;
    ctx.fillStyle = "#f7c31f";
    ctx.strokeStyle = "#1a1208";
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.45, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.45, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.45, cy - size * 0.05);
    ctx.lineTo(cx - size * 0.45, cy - size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ── Serpiente: un cuerpo continuo y redondeado + la cabeza con la cara de Gusty ──
  private drawSnake(frame: Frame) {
    const points = bodyPoints(frame.previous, frame.state, frame.progress);
    this.drawBody(points, frame);
    this.drawHead(points[0], frame);
  }

  /**
   * El cuerpo es UN solo trazado que pasa por el centro de las celdas, así que
   * no tiene uniones entre segmentos y mantiene siempre el mismo grosor. Los
   * giros de 90° salen redondeados (curvas cuadráticas con las celdas como
   * puntos de control). Se pinta en capas, de afuera hacia adentro, con las
   * claras corridas hacia arriba-izquierda para dar volumen.
   */
  private drawBody(points: Point[], frame: Frame) {
    const { ctx, cell, scenario } = this;
    const palette = scenario.snake;
    const gulp =
      this.reducedMotion || frame.expression !== "happy" ? 0 : Math.sin(Math.PI * frame.happyT);
    const width = cell * BODY_WIDTH_CELLS * (1 + SWELL * gulp);
    const path = this.buildBodyPath(points);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = width + Math.max(2, cell * 0.15);
    ctx.stroke(path);
    ctx.strokeStyle = palette.shade;
    ctx.lineWidth = width;
    ctx.stroke(path);
    this.strokeShifted(path, palette.base, width * 0.8, -width * 0.06, -width * 0.08);
    this.strokeShifted(path, palette.light, width * 0.5, -width * 0.11, -width * 0.15);
    this.strokeShifted(path, palette.shine, width * 0.15, -width * 0.19, -width * 0.25);
  }

  private strokeShifted(path: Path2D, color: string, lineWidth: number, dx: number, dy: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke(path);
    ctx.restore();
  }

  /** Trazado suavizado por puntos medios: pasa por los extremos y redondea las esquinas. */
  private buildBodyPath(points: Point[]): Path2D {
    const { cell } = this;
    const px = (point: Point) => (point.x + 0.5) * cell;
    const py = (point: Point) => (point.y + 0.5) * cell;
    const path = new Path2D();

    path.moveTo(px(points[0]), py(points[0]));
    if (points.length === 1) {
      path.lineTo(px(points[0]), py(points[0])); // un punto: se ve como un círculo
      return path;
    }
    if (points.length > 2) {
      path.lineTo((px(points[0]) + px(points[1])) / 2, (py(points[0]) + py(points[1])) / 2);
      for (let i = 1; i < points.length - 1; i++) {
        path.quadraticCurveTo(
          px(points[i]),
          py(points[i]),
          (px(points[i]) + px(points[i + 1])) / 2,
          (py(points[i]) + py(points[i + 1])) / 2,
        );
      }
    }
    const last = points[points.length - 1];
    path.lineTo(px(last), py(last));
    return path;
  }

  private drawHead(position: Point, frame: Frame) {
    const { ctx, cell } = this;
    const { state, expression } = frame;
    const direction = state.direction;
    const cx = (position.x + 0.5) * cell;
    const cy = (position.y + 0.5) * cell;

    if (direction === "right") this.facing = 1;
    else if (direction === "left") this.facing = -1;

    const byCheese = state.status === "over" && state.overReason === "cheese";
    const toxic = byCheese ? frame.deathFlash : 0;

    // Rebote al comer: la cabeza crece un poco y vuelve.
    const bounce =
      expression === "happy" && !this.reducedMotion
        ? 1 + 0.2 * Math.sin(Math.PI * frame.happyT)
        : 1;
    const faceSize = cell * HEAD_FACE_CELLS * bounce;

    if (toxic > 0) {
      const glow = ctx.createRadialGradient(cx, cy, faceSize * 0.2, cx, cy, faceSize * 0.95);
      glow.addColorStop(0, `rgba(163, 230, 53, ${0.55 * toxic})`);
      glow.addColorStop(1, "rgba(163, 230, 53, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, faceSize * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(cx, cy);
    if (GUSTY_SNAKE_HEAD_ORIENTATION === "rotate") {
      ctx.rotate(ROTATION[direction]);
    } else {
      ctx.scale(this.facing, 1);
      if (direction === "right" || direction === "left") ctx.rotate(TILT_RADIANS);
    }

    const sprite = this.assets.heads[expression] ?? this.assets.heads.normal;
    if (sprite && sprite.image.naturalWidth > 0) {
      // La cara (no todo el sprite) mide `faceSize`; la gota o las estrellas
      // sobresalen. Se centra en la cara, así la cabeza no se corre al cambiar de gesto.
      const { image, face } = sprite;
      const width = faceSize / face.w;
      const height = (width * image.naturalHeight) / image.naturalWidth;
      const dx = -(face.x + face.w / 2) * width;
      const dy = -(face.y + face.h / 2) * height;
      if (toxic > 0) this.drawTinted(image, dx, dy, width, height, `rgba(132, 204, 22, ${0.45 * toxic})`);
      else ctx.drawImage(image, dx, dy, width, height);
    } else {
      this.drawFallbackFace(faceSize, expression);
    }
    ctx.restore();
  }

  /** Dibuja el sprite con un color encima, solo sobre sus píxeles opacos. */
  private drawTinted(
    image: HTMLImageElement,
    dx: number,
    dy: number,
    width: number,
    height: number,
    color: string,
  ) {
    const pxW = Math.max(1, Math.ceil(width * this.dpr));
    const pxH = Math.max(1, Math.ceil(height * this.dpr));
    const layer = (this.tint ??= document.createElement("canvas"));
    if (layer.width !== pxW || layer.height !== pxH) {
      layer.width = pxW;
      layer.height = pxH;
    }
    const g = layer.getContext("2d");
    if (!g) {
      this.ctx.drawImage(image, dx, dy, width, height);
      return;
    }
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, pxW, pxH);
    g.drawImage(image, 0, 0, pxW, pxH);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = color;
    g.fillRect(0, 0, pxW, pxH);
    this.ctx.drawImage(layer, dx, dy, width, height);
  }

  /** Carita simple, para cuando la imagen de la cabeza todavía no cargó. */
  private drawFallbackFace(size: number, expression: HeadExpression) {
    const { ctx } = this;
    ctx.fillStyle = "#f6c945";
    ctx.strokeStyle = "#3a2a10";
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a2a10";
    ctx.lineCap = "round";
    if (expression === "dead") {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * size * 0.15 - size * 0.06, -size * 0.14);
        ctx.lineTo(sx * size * 0.15 + size * 0.06, -size * 0.02);
        ctx.moveTo(sx * size * 0.15 + size * 0.06, -size * 0.14);
        ctx.lineTo(sx * size * 0.15 - size * 0.06, -size * 0.02);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(-size * 0.15, -size * 0.08, size * 0.06, 0, Math.PI * 2);
      ctx.arc(size * 0.15, -size * 0.08, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    if (expression === "happy") ctx.arc(0, size * 0.04, size * 0.2, 0.05 * Math.PI, 0.95 * Math.PI);
    else ctx.arc(0, size * 0.04, size * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}
