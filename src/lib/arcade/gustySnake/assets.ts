// Imágenes de Gusty Glotón. Las rutas son CONFIGURABLES: para cambiar un
// sprite alcanza con copiar el archivo a public/arcade/gusty-snake/ y cambiar
// acá la ruta (y, si es una cabeza, la caja de la cara). Nada más depende del
// nombre. La carpeta conserva el nombre del juego original (gusty-snake) por la
// misma razón que la ruta: ver config.ts.
//
// Todos son PNG/WebP con transparencia real, recortados de la lámina de arte
// del juego (cómo se prepararon: specs/020-japarcade-gusty-snake.md).

import type { FoodKind } from "./config";

export type HeadExpression = "normal" | "happy" | "dead";

/**
 * Dónde está la CARA dentro del sprite de la cabeza, como fracciones (0–1) de
 * su ancho y alto. Los sprites de la cara feliz y la muerta traen cosas
 * alrededor (la gota, las estrellas): el tablero dibuja la cara a un tamaño
 * fijo y deja que esos adornos sobresalgan, en vez de achicar la cara.
 */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeadAsset {
  src: string;
  face: FaceBox;
}

export const GUSTY_SNAKE_ASSETS = {
  /** Logo «Gusty Glotón» (pantalla de inicio). */
  logo: { src: "/arcade/gusty-snake/logo.webp", width: 520, height: 375 },
  /** Las tres caras de Gusty: la cabeza de la serpiente y la del game over. */
  heads: {
    normal: {
      src: "/arcade/gusty-snake/head-normal.webp",
      face: { x: 0.0068, y: 0.0066, w: 0.9865, h: 0.9867 },
    },
    happy: {
      src: "/arcade/gusty-snake/head-happy.webp",
      face: { x: 0.006, y: 0.0063, w: 0.8589, h: 0.9873 },
    },
    dead: {
      src: "/arcade/gusty-snake/head-dead.webp",
      face: { x: 0.0535, y: 0.1239, w: 0.8366, h: 0.8676 },
    },
  } satisfies Record<HeadExpression, HeadAsset>,
  /** Las comidas (una por tipo de `GustySnakeConfig.foods`). */
  foods: {
    olive: { src: "/arcade/gusty-snake/food-olive.webp" },
    empanada: { src: "/arcade/gusty-snake/food-empanada.webp" },
    drumstick: { src: "/arcade/gusty-snake/food-drumstick.webp" },
  } satisfies Record<FoodKind, { src: string }>,
  /** El queso: el obstáculo mortal. */
  cheese: { src: "/arcade/gusty-snake/cheese.webp" },
  /** Portada del juego en JAPArcade (16:9). */
  cover: { src: "/arcade/gusty-snake/cover.webp" },
};

/**
 * Cómo acompaña la cabeza a la dirección del movimiento:
 *  - "tilt": la cara se mantiene derecha (una cara de frente puesta de lado o
 *    cabeza abajo no se lee), se espeja al ir a la izquierda y se inclina un
 *    poco hacia donde va. Al subir o bajar conserva el último lado.
 *  - "rotate": gira entera (0°, 90°, 180°, 270°). Para un sprite de perfil que
 *    "mira hacia arriba" en el archivo.
 */
export const GUSTY_SNAKE_HEAD_ORIENTATION: "tilt" | "rotate" = "tilt";
