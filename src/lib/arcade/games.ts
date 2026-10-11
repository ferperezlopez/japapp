// Registro de los juegos de JAPArcade. Sumar un juego nuevo = una carpeta bajo
// src/app/arcade/<id>/ + una entrada acá. Cada uno tiene su propio id (el
// `game_id` de la tabla arcade_scores, así que su ranking es independiente),
// ruta, portada y un interruptor para habilitarlo o deshabilitarlo.

import { GUSTY_SNAKE_ASSETS } from "./gustySnake/assets";
import { GUSTY_SNAKE_GAME_ID } from "./gustySnake/config";

export interface ArcadeGame {
  /** Identificador único y estable: es el `game_id` de los puntajes. */
  id: string;
  name: string;
  description: string;
  /** Ruta pública de la imagen de portada. */
  cover: string;
  /** Ruta propia del juego. */
  href: string;
  /** false lo saca de JAPArcade y hace que su ruta dé 404. */
  enabled: boolean;
}

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: GUSTY_SNAKE_GAME_ID,
    name: "Gusty Glotón",
    description: "Come de todo. Menos queso.",
    cover: GUSTY_SNAKE_ASSETS.cover.src,
    href: `/arcade/${GUSTY_SNAKE_GAME_ID}`,
    enabled: true,
  },
];

export function getArcadeGame(
  id: string,
  games: readonly ArcadeGame[] = ARCADE_GAMES,
): ArcadeGame | undefined {
  return games.find((game) => game.id === id);
}

/** Como getArcadeGame, pero undefined también si el juego está deshabilitado. */
export function getEnabledArcadeGame(
  id: string,
  games: readonly ArcadeGame[] = ARCADE_GAMES,
): ArcadeGame | undefined {
  const game = getArcadeGame(id, games);
  return game?.enabled ? game : undefined;
}

export function rankingHref(game: ArcadeGame): string {
  return `/arcade/${game.id}/ranking`;
}
