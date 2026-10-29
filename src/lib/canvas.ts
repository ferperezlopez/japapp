// Utilidades de dibujo en canvas compartidas por las imágenes que se comparten
// por WhatsApp (los equipos del fútbol y las infografías de Analytics).
// SOLO NAVEGADOR (usan canvas e Image).

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
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

export function roundedRect(
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
export function baselineAt(ctx: CanvasRenderingContext2D, centerY: number, fontSize: number): number {
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.9;
  const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.25;
  return centerY + (ascent - descent) / 2;
}

export function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Canvas.letterSpacing todavía no está en todos los navegadores: sin él el
  // texto queda apenas más angosto, nada más.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}
