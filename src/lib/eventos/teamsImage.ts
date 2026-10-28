// La cancha de «Ver equipos» como imagen, para compartirla por WhatsApp.
// SOLO NAVEGADOR (usa canvas, Image y document.fonts).
//
// Se dibuja a mano en un canvas en vez de capturar el DOM con una librería
// (html-to-image / html2canvas): no suma una dependencia y evita sus problemas
// conocidos en Safari/iOS (foreignObject, fuentes e imágenes que no llegan al
// primer intento, filter: drop-shadow). Qué jugador va dónde, con qué dorsal y
// camiseta lo decide buildPitchTeams (pitchLayout.ts), el mismo modelo que usa
// la vista en pantalla (TeamsPitchView). Lo que NO se comparte es el estilo:
// las medidas de abajo copian las del DOM (TeamsPitchView.tsx y Jersey.tsx) en
// px de una cancha de 300 de ancho — la del celular — y escaladas a 1080. Si
// se rediseñan las camisetas o las etiquetas en el DOM, hay que revisar acá.

import { abbreviateName } from "@/lib/formatName";
import {
  JERSEY_NUMBER_COLOR,
  PITCH_SIZE,
  PITCH_SRC,
  jerseySrc,
  type PitchPlayer,
  type PitchTeam,
} from "./pitchLayout";

/** Ancho de la cancha en pantalla en el que se midieron las constantes de abajo. */
const DESIGN_WIDTH = 300;
/** Ancho de la imagen (alto = ancho × 3/2, la proporción de la cancha). */
const IMAGE_WIDTH = 1080;
const JPEG_QUALITY = 0.92;

// Camiseta (`w-16`) y su sombra (`drop-shadow(0 3px 4px rgba(0,0,0,0.4))`).
const JERSEY_WIDTH = 64;
const JERSEY_SHADOW = { offsetY: 3, blur: 4, color: "rgba(0,0,0,0.4)" };
// Dorsal: `text-xl font-extrabold`, centrado al 53% del alto de la camiseta.
const NUMBER = { size: 20, weight: 800, centerY: 0.53 };
// Nombre bajo la camiseta: `rounded-full bg-black/40 px-1.5 py-0.5 text-[9px]
// font-medium`, separado por `gap-0.5`.
const PILL = { size: 9, weight: 500, lineHeight: 12.857, padX: 6, padY: 2, gap: 2, background: "rgba(0,0,0,0.4)" };
// Etiqueta del equipo: `rounded-md bg-black/50 px-2 py-1 text-xs font-bold
// uppercase tracking-wide`, a 8 px del borde (arriba el equipo 1, abajo el 2).
const LABEL = { size: 12, weight: 700, lineHeight: 16, padX: 8, padY: 4, inset: 8, radius: 6, spacing: 0.3, background: "rgba(0,0,0,0.5)", countColor: "#cbd5e1" };
// «Sin jugadores»: `text-xs text-white/70`, centrado en toda la cancha.
const EMPTY = { size: 12, color: "rgba(255,255,255,0.7)" };

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let image = images.get(src);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      element.src = src;
    });
    // Un fallo no se queda en la caché: el próximo intento vuelve a pedirla.
    image.catch(() => images.delete(src));
    images.set(src, image);
  }
  return image;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Línea base para que el texto quede centrado en `centerY` como en CSS: el
 * "content area" de la fuente (ascent + descent) va centrado en la caja de la
 * línea, así que la base cae a (ascent − descent) / 2 por debajo del centro.
 */
function baselineAt(ctx: CanvasRenderingContext2D, centerY: number, fontSize: number): number {
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.9;
  const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.25;
  return centerY + (ascent - descent) / 2;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Canvas.letterSpacing todavía no está en todos los navegadores: sin él el
  // texto queda apenas más angosto, nada más.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function drawTeamLabel(
  ctx: CanvasRenderingContext2D,
  team: PitchTeam,
  scale: number,
  height: number,
  family: string,
) {
  ctx.font = `${LABEL.weight} ${LABEL.size * scale}px ${family}`;
  setLetterSpacing(ctx, LABEL.spacing * scale);
  const name = `EQUIPO ${team.team} `;
  const count = `(${team.total})`;
  const nameWidth = ctx.measureText(name).width;
  const boxWidth = nameWidth + ctx.measureText(count).width + 2 * LABEL.padX * scale;
  const boxHeight = (LABEL.lineHeight + 2 * LABEL.padY) * scale;
  const x = LABEL.inset * scale;
  const y = team.team === 1 ? LABEL.inset * scale : height - LABEL.inset * scale - boxHeight;

  roundedRect(ctx, x, y, boxWidth, boxHeight, LABEL.radius * scale);
  ctx.fillStyle = LABEL.background;
  ctx.fill();

  ctx.textAlign = "left";
  const baseline = baselineAt(ctx, y + boxHeight / 2, LABEL.size * scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, x + LABEL.padX * scale, baseline);
  ctx.fillStyle = LABEL.countColor;
  ctx.fillText(count, x + LABEL.padX * scale + nameWidth, baseline);
  setLetterSpacing(ctx, 0);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PitchPlayer,
  y: number,
  jersey: HTMLImageElement,
  scale: number,
  width: number,
  height: number,
  family: string,
) {
  const jerseyWidth = JERSEY_WIDTH * scale;
  const jerseyHeight = (jerseyWidth * jersey.naturalHeight) / jersey.naturalWidth;
  const pillHeight = (PILL.lineHeight + 2 * PILL.padY) * scale;
  const blockHeight = jerseyHeight + PILL.gap * scale + pillHeight;
  // El centro del bloque (camiseta + nombre) es el punto (x%, y%) de la cancha.
  const centerX = (player.x / 100) * width;
  const top = (y / 100) * height - blockHeight / 2;
  const left = centerX - jerseyWidth / 2;

  ctx.save();
  ctx.shadowColor = JERSEY_SHADOW.color;
  ctx.shadowBlur = JERSEY_SHADOW.blur * scale;
  ctx.shadowOffsetY = JERSEY_SHADOW.offsetY * scale;
  ctx.drawImage(jersey, left, top, jerseyWidth, jerseyHeight);
  ctx.restore();

  ctx.font = `${NUMBER.weight} ${NUMBER.size * scale}px ${family}`;
  ctx.textAlign = "center";
  ctx.fillStyle = JERSEY_NUMBER_COLOR[player.variant];
  ctx.fillText(
    String(player.number),
    centerX,
    baselineAt(ctx, top + jerseyHeight * NUMBER.centerY, NUMBER.size * scale),
  );

  ctx.font = `${PILL.weight} ${PILL.size * scale}px ${family}`;
  const label = abbreviateName(player.name);
  const pillWidth = ctx.measureText(label).width + 2 * PILL.padX * scale;
  const pillTop = top + jerseyHeight + PILL.gap * scale;
  roundedRect(ctx, centerX - pillWidth / 2, pillTop, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = PILL.background;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, centerX, baselineAt(ctx, pillTop + pillHeight / 2, PILL.size * scale));
}

/** La cancha con los dos equipos como imagen JPEG de 1080 × 1620. */
export async function renderTeamsImage(teams: readonly PitchTeam[]): Promise<Blob> {
  const scale = IMAGE_WIDTH / DESIGN_WIDTH;
  const width = IMAGE_WIDTH;
  const height = Math.round((IMAGE_WIDTH * PITCH_SIZE.height) / PITCH_SIZE.width);
  const family = getComputedStyle(document.body).fontFamily;

  const sources = new Set<string>([PITCH_SRC]);
  for (const team of teams) {
    for (const row of team.rows) {
      for (const player of row.players) sources.add(jerseySrc(player.variant, player.badge));
    }
  }
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all([
    ...[...sources].map(async (src) => loaded.set(src, await loadImage(src))),
    // La página ya usa estos tres pesos; se espera igual para no dibujar con
    // la fuente de respaldo si todavía no llegaron.
    document.fonts?.load(`${NUMBER.weight} ${NUMBER.size}px ${family}`).catch(() => undefined),
    document.fonts?.load(`${LABEL.weight} ${LABEL.size}px ${family}`).catch(() => undefined),
    document.fonts?.load(`${PILL.weight} ${PILL.size}px ${family}`).catch(() => undefined),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no puede dibujar la imagen.");
  ctx.textBaseline = "alphabetic";

  ctx.drawImage(loaded.get(PITCH_SRC)!, 0, 0, width, height);

  // Mismo orden de apilado que en pantalla: cada equipo con su etiqueta y sus
  // filas, y el equipo 2 por encima del 1.
  for (const team of teams) {
    drawTeamLabel(ctx, team, scale, height, family);
    if (team.total === 0) {
      ctx.font = `400 ${EMPTY.size * scale}px ${family}`;
      ctx.textAlign = "center";
      ctx.fillStyle = EMPTY.color;
      ctx.fillText("Sin jugadores", width / 2, baselineAt(ctx, height / 2, EMPTY.size * scale));
      continue;
    }
    for (const row of team.rows) {
      for (const player of row.players) {
        drawPlayer(ctx, player, row.y, loaded.get(jerseySrc(player.variant, player.badge))!, scale, width, height, family);
      }
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
