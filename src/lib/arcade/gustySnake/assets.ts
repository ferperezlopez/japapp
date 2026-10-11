// Imágenes de Gusty Snake. Las rutas son CONFIGURABLES: para poner el arte
// definitivo alcanza con copiar el archivo a public/arcade/gusty-snake/ y
// cambiar acá la ruta y `placeholder` a false. Nada más depende del nombre.
//
// Hoy los tres son PLACEHOLDERS provisorios (se nota en el nombre:
// `*.placeholder.*`): no son el arte definitivo y no se deben dar por tales.
// Detalle y lista de pendientes: specs/020-japarcade-gusty-snake.md.

export interface GameAsset {
  /** Ruta pública del archivo, dentro de /public. */
  src: string;
  /** true mientras sea un placeholder provisorio y no el arte definitivo. */
  placeholder: boolean;
  /**
   * Solo para la cabeza: true si es una foto cuadrada (por ejemplo un avatar
   * de perfil), que se recorta en círculo; false si es un sprite con fondo
   * transparente, que se dibuja tal cual.
   */
  clipToCircle?: boolean;
}

export const GUSTY_SNAKE_ASSETS = {
  /** Cabeza de la serpiente: la cara de Gusty (PNG o WebP con fondo transparente). */
  head: {
    src: "/arcade/gusty-snake/gusty-head.placeholder.png",
    placeholder: true,
    clipToCircle: false,
  },
  /** Patita de pollo cocida, estilo cartoon (PNG o WebP con fondo transparente). */
  food: { src: "/arcade/gusty-snake/drumstick.placeholder.png", placeholder: true },
  /** Portada del juego en JAPArcade. */
  cover: { src: "/arcade/gusty-snake/cover.placeholder.webp", placeholder: true },
} satisfies Record<string, GameAsset>;

/**
 * Cómo acompaña la cabeza a la dirección del movimiento:
 *  - "tilt": la cara se mantiene derecha (una cara de frente puesta de lado o
 *    cabeza abajo no se lee), se espeja al ir a la izquierda y se inclina un
 *    poco hacia donde va.
 *  - "rotate": gira entera (0°, 90°, 180°, 270°). Para un sprite de perfil que
 *    "mira hacia arriba" en el archivo.
 */
export const GUSTY_SNAKE_HEAD_ORIENTATION: "tilt" | "rotate" = "tilt";
