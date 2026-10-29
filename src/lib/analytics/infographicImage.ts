// Una infografía de Analytics (ver infographic.ts) como imagen, para compartirla
// por WhatsApp. SOLO NAVEGADOR (usa canvas, Image y document.fonts).
//
// Se dibuja a mano en un canvas, igual que «Ver equipos» (teamsImage.ts): sin
// librerías y sin los problemas de capturar el DOM en Safari. Qué dice cada
// infografía lo decide infographic.ts; acá solo se ubica y se pinta. La imagen
// siempre es clara (los colores de la app en modo claro), aunque el celular esté
// en oscuro: así se ve igual en cualquier chat. Las personas van con sus
// iniciales y no con la foto: una foto de otro dominio "mancha" el canvas (CORS)
// y después no se puede exportar.
//
// El alto depende del contenido: se mide primero (misma rutina, sin pintar) y
// después se dibuja en un canvas de ese alto.

import { baselineAt, loadImage, roundedRect, setLetterSpacing } from "@/lib/canvas";
import { initialsFrom } from "@/lib/formatName";
import type { Tone } from "./delta";
import type {
  InfographicBar,
  InfographicBlock,
  InfographicDelta,
  InfographicSpec,
} from "./infographic";

const WIDTH = 1080;
const PAD = 56;
const INNER = WIDTH - 2 * PAD;
const GAP = 28;
/** Un canvas muy alto falla en algunos celulares: si el contenido pasa de acá, se corta lo último. */
const MAX_HEIGHT = 6000;
const JPEG_QUALITY = 0.92;
const LOGO_SRC = "/icon-192.png";

// Los colores de la app en modo claro (globals.css) y los de las variaciones
// (Tailwind emerald-700 / red-700, como DeltaBadge).
const COLOR = {
  background: "#f5f1e8",
  foreground: "#0b1f2a",
  surface: "#ffffff",
  border: "rgba(11,31,42,0.10)",
  muted: "rgba(11,31,42,0.58)",
  faint: "rgba(11,31,42,0.45)",
  strong: "rgba(11,31,42,0.82)",
  brand: "#ff8c2a",
  eventos: "#1f4e6b",
  eventosSoft: "#e6edf1",
  gastos: "#b22234",
  barBackground: "rgba(31,78,107,0.13)",
  barBackgroundFaint: "rgba(11,31,42,0.05)",
  good: "#047857",
  bad: "#b91c1c",
  equal: "rgba(11,31,42,0.5)",
  gold: "#f2c14e",
  silver: "#c5ccd3",
  bronze: "#d8a06b",
} as const;

const TONE_COLOR: Record<Tone, string> = { good: COLOR.good, bad: COLOR.bad, equal: COLOR.equal };
const BAR_COLOR = { eventos: COLOR.eventos, gastos: COLOR.gastos } as const;

interface Painter {
  ctx: CanvasRenderingContext2D;
  /** false: solo se mide (no se pinta nada). */
  draw: boolean;
  body: string;
  heading: string;
  logo: HTMLImageElement | null;
  stamp: string;
}

// ───────────────────────────── Texto ─────────────────────────────

function setFont(p: Painter, weight: number, size: number, kind: "body" | "heading" = "body") {
  p.ctx.font = `${weight} ${size}px ${kind === "heading" ? p.heading : p.body}`;
}

// Recorta con «…» lo que no entra en `maxWidth` (con la fuente ya elegida).
function fit(p: Painter, text: string, maxWidth: number): string {
  const { ctx } = p;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

// Parte en renglones (con la fuente ya elegida); lo que pasa de `maxLines` se
// resume con «…» en el último.
function wrap(p: Painter, text: string, maxWidth: number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || p.ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
    return kept.map((l) => fit(p, l, maxWidth));
  }
  return lines.map((l) => fit(p, l, maxWidth));
}

interface TextStyle {
  weight: number;
  size: number;
  color: string;
  kind?: "body" | "heading";
  align?: CanvasTextAlign;
}

// Texto centrado verticalmente en `centerY`.
function drawText(p: Painter, text: string, x: number, centerY: number, style: TextStyle) {
  setFont(p, style.weight, style.size, style.kind);
  if (!p.draw) return;
  p.ctx.textAlign = style.align ?? "left";
  p.ctx.fillStyle = style.color;
  p.ctx.fillText(text, x, baselineAt(p.ctx, centerY, style.size));
}

// Lo mismo, recortado con «…» para que entre en `maxWidth`. Elige la fuente antes
// de medir: si se midiera con otra, el recorte saldría mal.
function drawFit(p: Painter, text: string, x: number, centerY: number, maxWidth: number, style: TextStyle) {
  setFont(p, style.weight, style.size, style.kind);
  drawText(p, fit(p, text, maxWidth), x, centerY, style);
}

function textWidth(p: Painter, text: string, weight: number, size: number, kind: "body" | "heading" = "body") {
  setFont(p, weight, size, kind);
  return p.ctx.measureText(text).width;
}

// ───────────────────────────── Formas ─────────────────────────────

function fillRound(p: Painter, x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) {
  if (!p.draw) return;
  roundedRect(p.ctx, x, y, w, h, radius);
  p.ctx.fillStyle = fill;
  p.ctx.fill();
  if (stroke) {
    p.ctx.lineWidth = 2;
    p.ctx.strokeStyle = stroke;
    p.ctx.stroke();
  }
}

function card(p: Painter, x: number, y: number, w: number, h: number) {
  fillRound(p, x, y, w, h, 32, COLOR.surface, COLOR.border);
}

function circle(p: Painter, cx: number, cy: number, radius: number, fill: string, stroke?: string) {
  if (!p.draw) return;
  p.ctx.beginPath();
  p.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  p.ctx.fillStyle = fill;
  p.ctx.fill();
  if (stroke) {
    p.ctx.lineWidth = 2;
    p.ctx.strokeStyle = stroke;
    p.ctx.stroke();
  }
}

function initialsCircle(p: Painter, name: string, cx: number, cy: number, radius: number, fontSize: number) {
  circle(p, cx, cy, radius, COLOR.background, COLOR.border);
  drawText(p, initialsFrom(name), cx, cy, { weight: 700, size: fontSize, color: COLOR.muted, kind: "heading", align: "center" });
}

// Una variación: triángulo (o «=») y el texto, del color de si es mejor o peor.
// Devuelve el ancho que ocupó.
function drawDelta(p: Painter, delta: InfographicDelta, x: number, centerY: number, size: number): number {
  const color = TONE_COLOR[delta.tone];
  const mark = size * 0.62;
  if (p.draw) {
    const { ctx } = p;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (delta.direction === "flat") {
      ctx.lineWidth = Math.max(3, size / 9);
      ctx.beginPath();
      ctx.moveTo(x, centerY - mark * 0.22);
      ctx.lineTo(x + mark, centerY - mark * 0.22);
      ctx.moveTo(x, centerY + mark * 0.22);
      ctx.lineTo(x + mark, centerY + mark * 0.22);
      ctx.stroke();
    } else {
      const half = mark * 0.45;
      ctx.beginPath();
      if (delta.direction === "up") {
        ctx.moveTo(x + mark / 2, centerY - half);
        ctx.lineTo(x + mark, centerY + half);
        ctx.lineTo(x, centerY + half);
      } else {
        ctx.moveTo(x, centerY - half);
        ctx.lineTo(x + mark, centerY - half);
        ctx.lineTo(x + mark / 2, centerY + half);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const textX = x + mark + size * 0.35;
  drawText(p, delta.text, textX, centerY, { weight: 700, size, color });
  return mark + size * 0.35 + textWidth(p, delta.text, 700, size);
}

// ───────────────────────────── Encabezado y pie ─────────────────────────────

const LOGO = 96;
const AVATAR = 128;

function layoutHeader(p: Painter, spec: InfographicSpec, top: number): number {
  const { ctx } = p;
  if (p.draw) {
    ctx.fillStyle = COLOR.brand;
    ctx.fillRect(0, 0, WIDTH, 16);
  }
  let y = top;

  const hasAvatar = spec.avatarName !== null;
  const textX = PAD + (hasAvatar ? AVATAR + 28 : 0);
  const textWidthMax = WIDTH - PAD - textX - (LOGO + 24);
  if (spec.avatarName !== null) initialsCircle(p, spec.avatarName, PAD + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 52);
  if (p.draw && p.logo) {
    ctx.save();
    roundedRect(ctx, WIDTH - PAD - LOGO, y, LOGO, LOGO, 24);
    ctx.clip();
    ctx.drawImage(p.logo, WIDTH - PAD - LOGO, y, LOGO, LOGO);
    ctx.restore();
  }

  // Kicker en mayúsculas con letras separadas.
  setFont(p, 700, 28);
  if (p.draw) setLetterSpacing(ctx, 3);
  drawText(p, spec.kicker.toUpperCase(), textX, y + 18, { weight: 700, size: 28, color: COLOR.brand });
  if (p.draw) setLetterSpacing(ctx, 0);
  y += 44;

  setFont(p, 700, 68, "heading");
  const titleLines = wrap(p, spec.title, textWidthMax, 2);
  for (const line of titleLines) {
    drawText(p, line, textX, y + 39, { weight: 700, size: 68, color: COLOR.foreground, kind: "heading" });
    y += 78;
  }

  if (spec.subtitle) {
    setFont(p, 400, 34);
    for (const line of wrap(p, spec.subtitle, textWidthMax, 2)) {
      drawText(p, line, textX, y + 22, { weight: 400, size: 34, color: COLOR.muted });
      y += 44;
    }
  }

  if (spec.chips.length > 0) {
    y += 12;
    let x = textX;
    for (const chip of spec.chips) {
      const width = textWidth(p, chip, 600, 26) + 40;
      fillRound(p, x, y, width, 48, 24, COLOR.eventosSoft);
      drawText(p, chip, x + 20, y + 24, { weight: 600, size: 26, color: COLOR.eventos });
      x += width + 12;
    }
    y += 48;
  }

  // Si hay logo (o avatar) más alto que el texto, el encabezado llega hasta él.
  return Math.max(y, top + Math.max(LOGO, hasAvatar ? AVATAR : 0)) + GAP + 16;
}

function layoutFooter(p: Painter, top: number): number {
  const y = top + 8;
  if (p.draw) {
    p.ctx.fillStyle = COLOR.border;
    p.ctx.fillRect(PAD, y, INNER, 2);
  }
  const center = y + 52;
  drawText(p, "JAPApp", PAD, center, { weight: 700, size: 38, color: COLOR.brand, kind: "heading" });
  const nameWidth = textWidth(p, "JAPApp", 700, 38, "heading");
  drawText(p, " · Analytics", PAD + nameWidth, center, { weight: 500, size: 28, color: COLOR.muted });
  drawText(p, p.stamp, WIDTH - PAD, center, { weight: 400, size: 26, color: COLOR.faint, align: "right" });
  return y + 104;
}

// ───────────────────────────── Bloques ─────────────────────────────

const CARD_PAD = 32;

function layoutStats(p: Painter, block: Extract<InfographicBlock, { type: "stats" }>, top: number): number {
  const columns = 2;
  const gap = 24;
  const cardW = (INNER - gap) / columns;
  const textW = cardW - 2 * CARD_PAD;
  let y = top;

  for (let start = 0; start < block.items.length; start += columns) {
    const row = block.items.slice(start, start + columns);
    const notes = row.map((item) => {
      setFont(p, 400, 26);
      return item.note ? wrap(p, item.note, textW, 2) : [];
    });
    // El alto de la fila lo marca la tarjeta más alta; todas se dibujan igual.
    const heights = row.map((item, i) => CARD_PAD + 36 + 80 + (notes[i].length > 0 ? 8 + notes[i].length * 34 : 0) + (item.delta ? 56 : 0) + CARD_PAD - 8);
    const rowH = Math.max(...heights);

    row.forEach((item, i) => {
      const x = PAD + i * (cardW + gap);
      card(p, x, y, cardW, rowH);
      let cy = y + CARD_PAD;
      drawFit(p, item.label, x + CARD_PAD, cy + 18, textW, { weight: 500, size: 28, color: COLOR.muted });
      cy += 36;
      drawFit(p, item.value, x + CARD_PAD, cy + 44, textW, { weight: 700, size: 64, color: COLOR.foreground, kind: "heading" });
      cy += 80;
      if (notes[i].length > 0) {
        cy += 8;
        for (const line of notes[i]) {
          drawText(p, line, x + CARD_PAD, cy + 17, { weight: 400, size: 26, color: COLOR.muted });
          cy += 34;
        }
      }
      if (item.delta) {
        drawDelta(p, item.delta, x + CARD_PAD, cy + 36, 28);
      }
    });
    y += rowH + gap;
  }
  return y - gap + GAP;
}

function layoutBars(p: Painter, block: Extract<InfographicBlock, { type: "bars" }>, top: number): number {
  const innerW = INNER - 2 * CARD_PAD;
  const chartTop = 84;
  const labelsH = 36;
  const barsH = 250;
  const axisH = 44;

  setFont(p, 400, 24);
  const noteLines = block.note ? wrap(p, block.note, innerW, 3) : [];
  const deltaH = block.delta ? 64 : 0;
  const noteH = noteLines.length > 0 ? 12 + noteLines.length * 32 : 0;
  const height = CARD_PAD + chartTop - CARD_PAD / 2 + labelsH + barsH + axisH + deltaH + noteH + CARD_PAD / 2;

  card(p, PAD, top, INNER, height);
  const left = PAD + CARD_PAD;
  let y = top + CARD_PAD;

  drawFit(p, block.title, left, y + 20, innerW * 0.6, { weight: 600, size: 28, color: COLOR.muted });
  const max = Math.max(0, block.reference?.value ?? 0, ...block.bars.map((b) => b.value ?? 0));
  if (block.reference && max > 0) {
    const labelW = textWidth(p, block.reference.label, 400, 26);
    drawText(p, block.reference.label, left + innerW, y + 20, { weight: 400, size: 26, color: COLOR.muted, align: "right" });
    if (p.draw) {
      p.ctx.save();
      p.ctx.setLineDash([8, 7]);
      p.ctx.lineWidth = 3;
      p.ctx.strokeStyle = COLOR.equal;
      p.ctx.beginPath();
      p.ctx.moveTo(left + innerW - labelW - 64, y + 20);
      p.ctx.lineTo(left + innerW - labelW - 16, y + 20);
      p.ctx.stroke();
      p.ctx.restore();
    }
  }
  y += chartTop - CARD_PAD / 2;

  const n = Math.max(1, block.bars.length);
  const slot = innerW / n;
  const barW = Math.min(slot - 18, 92);
  const anyHighlight = block.bars.some((b) => b.highlight);
  const baseY = y + labelsH + barsH;
  const valueSize = n > 8 ? 22 : 26;
  const scale = (v: number) => (max > 0 ? (v / max) * barsH : 0);

  block.bars.forEach((bar: InfographicBar, i) => {
    const cx = left + slot * i + slot / 2;
    drawFit(p, bar.valueLabel, cx, y + labelsH / 2, slot, {
      weight: bar.highlight ? 700 : 500,
      size: valueSize,
      color: COLOR.strong,
      align: "center",
    });
    if (bar.value !== null && bar.value > 0 && p.draw) {
      p.ctx.globalAlpha = anyHighlight && !bar.highlight ? 0.4 : 1;
      const h = Math.max(4, scale(bar.value));
      roundedRect(p.ctx, cx - barW / 2, baseY - h, barW, h, 10);
      p.ctx.fillStyle = BAR_COLOR[block.tone];
      p.ctx.fill();
      p.ctx.globalAlpha = 1;
    }
    drawFit(p, bar.label, cx, baseY + axisH / 2 + 2, slot, {
      weight: bar.highlight ? 700 : 400,
      size: 24,
      color: bar.highlight ? COLOR.foreground : COLOR.muted,
      align: "center",
    });
  });
  if (p.draw) {
    p.ctx.fillStyle = COLOR.border;
    p.ctx.fillRect(left, baseY, innerW, 3);
    if (block.reference && max > 0) {
      const refY = baseY - scale(block.reference.value);
      p.ctx.save();
      p.ctx.setLineDash([14, 10]);
      p.ctx.lineWidth = 3;
      p.ctx.strokeStyle = COLOR.equal;
      p.ctx.beginPath();
      p.ctx.moveTo(left, refY);
      p.ctx.lineTo(left + innerW, refY);
      p.ctx.stroke();
      p.ctx.restore();
    }
  }
  y = baseY + axisH;

  if (block.delta) {
    const used = drawDelta(p, block.delta, left, y + 30, 30);
    drawText(p, "vs. la mediana", left + used + 14, y + 30, { weight: 400, size: 26, color: COLOR.muted });
    y += deltaH;
  }
  if (noteLines.length > 0) {
    y += 12;
    for (const line of noteLines) {
      drawText(p, line, left, y + 16, { weight: 400, size: 24, color: COLOR.faint });
      y += 32;
    }
  }
  return top + height + GAP;
}

function rankMark(p: Painter, rank: number | null, cx: number, cy: number) {
  if (rank === null) {
    drawText(p, "–", cx, cy, { weight: 600, size: 30, color: COLOR.faint, align: "center" });
    return;
  }
  const medal = rank === 1 ? COLOR.gold : rank === 2 ? COLOR.silver : rank === 3 ? COLOR.bronze : null;
  if (medal) circle(p, cx, cy, 24, medal);
  drawText(p, String(rank), cx, cy, {
    weight: 700,
    size: 28,
    color: medal ? COLOR.foreground : COLOR.muted,
    align: "center",
  });
}

const ROW_H = 100;

function layoutRanking(p: Painter, block: Extract<InfographicBlock, { type: "ranking" }>, top: number): number {
  const innerW = INNER - 2 * CARD_PAD;
  setFont(p, 400, 24);
  const noteLines = block.note ? wrap(p, block.note, innerW, 3) : [];
  const titleH = block.title ? 64 : 0;
  const moreH = block.more > 0 ? 52 : 0;
  const noteH = noteLines.length > 0 ? 12 + noteLines.length * 32 : 0;
  const height = CARD_PAD + titleH + block.rows.length * ROW_H + moreH + noteH + CARD_PAD - 8;

  card(p, PAD, top, INNER, height);
  const left = PAD + CARD_PAD;
  let y = top + CARD_PAD - 4;

  if (block.title) {
    drawFit(p, block.title, left, y + 24, innerW, { weight: 700, size: 36, color: COLOR.foreground, kind: "heading" });
    y += titleH;
  }
  for (const row of block.rows) {
    const fill = block.max > 0 ? Math.min(Math.max(row.value / block.max, row.value > 0 ? 0.05 : 0), 1) : 0;
    fillRound(p, left, y + 6, innerW, ROW_H - 12, 22, COLOR.barBackgroundFaint);
    if (fill > 0) {
      // La barra es el valor relativo al mayor del ranking.
      fillRound(p, left, y + 6, Math.max(innerW * fill, 44), ROW_H - 12, 22, row.rank === null ? COLOR.barBackgroundFaint : COLOR.barBackground);
    }
    const mid = y + ROW_H / 2;
    rankMark(p, row.rank, left + 40, mid);
    initialsCircle(p, row.name, left + 112, mid, 30, 24);

    const valueW = textWidth(p, row.valueLabel, 700, 34);
    const nameX = left + 164;
    const nameW = innerW - 164 - valueW - 24 - 20;
    drawText(p, row.valueLabel, left + innerW - 20, mid, { weight: 700, size: 34, color: COLOR.foreground, align: "right" });
    if (row.detail) {
      drawFit(p, row.name, nameX, mid - 17, nameW, { weight: 600, size: 34, color: COLOR.foreground });
      drawFit(p, row.detail, nameX, mid + 22, nameW, { weight: 400, size: 24, color: COLOR.muted });
    } else {
      drawFit(p, row.name, nameX, mid, nameW, { weight: 600, size: 34, color: COLOR.foreground });
    }
    y += ROW_H;
  }
  if (block.more > 0) {
    drawText(p, `y ${block.more} más`, left, y + 26, { weight: 500, size: 26, color: COLOR.muted });
    y += moreH;
  }
  if (noteLines.length > 0) {
    y += 12;
    for (const line of noteLines) {
      drawText(p, line, left, y + 16, { weight: 400, size: 24, color: COLOR.faint });
      y += 32;
    }
  }
  return top + height + GAP;
}

const FACT_H = 80;

function layoutFacts(p: Painter, block: Extract<InfographicBlock, { type: "facts" }>, top: number): number {
  const innerW = INNER - 2 * CARD_PAD;
  setFont(p, 400, 24);
  const noteLines = block.note ? wrap(p, block.note, innerW, 3) : [];
  const noteH = noteLines.length > 0 ? 16 + noteLines.length * 32 : 0;
  const height = CARD_PAD + 64 + block.rows.length * FACT_H + noteH + CARD_PAD - 12;

  card(p, PAD, top, INNER, height);
  const left = PAD + CARD_PAD;
  let y = top + CARD_PAD - 4;

  drawFit(p, block.title, left, y + 24, innerW, { weight: 700, size: 36, color: COLOR.foreground, kind: "heading" });
  y += 64;

  block.rows.forEach((row, i) => {
    if (i > 0 && p.draw) {
      p.ctx.fillStyle = COLOR.border;
      p.ctx.fillRect(left, y, innerW, 2);
    }
    const mid = y + FACT_H / 2;
    let right = left + innerW;
    if (row.tag) {
      const tagW = textWidth(p, row.tag, 600, 24) + 28;
      fillRound(p, right - tagW, mid - 20, tagW, 40, 20, COLOR.eventosSoft);
      drawText(p, row.tag, right - tagW / 2, mid, { weight: 600, size: 24, color: COLOR.eventos, align: "center" });
      right -= tagW + 16;
    }
    setFont(p, 700, 36);
    const valueText = fit(p, row.value, innerW * 0.45);
    const valueW = textWidth(p, valueText, 700, 36);
    drawText(p, valueText, right, mid, { weight: 700, size: 36, color: COLOR.foreground, align: "right" });
    drawFit(p, row.label, left, mid, right - valueW - 24 - left, { weight: 400, size: 32, color: COLOR.strong });
    y += FACT_H;
  });

  if (noteLines.length > 0) {
    y += 16;
    for (const line of noteLines) {
      drawText(p, line, left, y + 16, { weight: 400, size: 24, color: COLOR.faint });
      y += 32;
    }
  }
  return top + height + GAP;
}

function layoutNote(p: Painter, block: Extract<InfographicBlock, { type: "note" }>, top: number): number {
  setFont(p, 400, 26);
  const lines = wrap(p, block.text, INNER, 4);
  let y = top;
  for (const line of lines) {
    drawText(p, line, PAD, y + 17, { weight: 400, size: 26, color: COLOR.muted });
    y += 36;
  }
  return y + GAP - 8;
}

function layoutBlock(p: Painter, block: InfographicBlock, top: number): number {
  switch (block.type) {
    case "stats":
      return layoutStats(p, block, top);
    case "bars":
      return layoutBars(p, block, top);
    case "ranking":
      return layoutRanking(p, block, top);
    case "facts":
      return layoutFacts(p, block, top);
    case "note":
      return layoutNote(p, block, top);
  }
}

// ───────────────────────────── Imagen ─────────────────────────────

// Toda la infografía, de arriba abajo. Con `draw` en false solo mide: devuelve el
// alto y cuántos bloques entran antes de pasar el máximo.
function layoutAll(p: Painter, spec: InfographicSpec): { height: number; blocks: number } {
  let y = layoutHeader(p, spec, 16 + 56);
  let blocks = 0;
  for (const block of spec.blocks) {
    const bottom = layoutBlock(p, block, y);
    // Si con este bloque (más el pie) no entra, se corta acá: lo último es lo menos importante.
    if (bottom + 112 + 40 > MAX_HEIGHT && blocks > 0) break;
    y = bottom;
    blocks++;
  }
  y = layoutFooter(p, y);
  return { height: Math.ceil(y + 24), blocks };
}

/** La infografía como JPEG de 1080 px de ancho y el alto que pida el contenido. */
export async function renderInfographic(spec: InfographicSpec): Promise<Blob> {
  const body = getComputedStyle(document.body).fontFamily;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  const heading = display || body;

  await Promise.all([
    ...[400, 500, 600, 700].map((w) => document.fonts?.load(`${w} 30px ${body}`).catch(() => undefined)),
    ...[600, 700].map((w) => document.fonts?.load(`${w} 40px ${heading}`).catch(() => undefined)),
  ]);
  // Sin el logo la infografía sale igual: es un adorno, no el contenido.
  const logo = await loadImage(LOGO_SRC).catch(() => null);
  const stamp = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("El navegador no puede dibujar la imagen.");
  const measure: Painter = { ctx: measureCtx, draw: false, body, heading, logo, stamp };
  const { height, blocks } = layoutAll(measure, spec);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no puede dibujar la imagen.");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, WIDTH, height);

  // Los bloques que no entraron en el alto máximo se dejan afuera también al pintar.
  layoutAll({ ctx, draw: true, body, heading, logo, stamp }, { ...spec, blocks: spec.blocks.slice(0, blocks) });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
