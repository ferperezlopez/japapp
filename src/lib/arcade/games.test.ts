import { describe, expect, it } from "vitest";
import {
  ARCADE_GAMES,
  getArcadeGame,
  getEnabledArcadeGame,
  rankingHref,
} from "./games";

describe("registro de juegos", () => {
  it("los ids son únicos", () => {
    const ids = ARCADE_GAMES.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada juego tiene su ruta propia bajo /arcade/<id>", () => {
    for (const game of ARCADE_GAMES) {
      expect(game.href).toBe(`/arcade/${game.id}`);
      expect(game.cover.startsWith("/")).toBe(true);
      expect(game.name.length).toBeGreaterThan(0);
    }
  });

  it("los ids caben en el check de la tabla (1 a 40 caracteres)", () => {
    for (const game of ARCADE_GAMES) {
      expect(game.id.length).toBeGreaterThanOrEqual(1);
      expect(game.id.length).toBeLessThanOrEqual(40);
    }
  });

  it("Gusty Glotón es el primer juego y está habilitado", () => {
    expect(ARCADE_GAMES[0].id).toBe("gusty-snake");
    expect(getEnabledArcadeGame("gusty-snake")?.name).toBe("Gusty Glotón");
  });

  it("un id que no existe no devuelve nada", () => {
    expect(getArcadeGame("no-existe")).toBeUndefined();
    expect(getEnabledArcadeGame("no-existe")).toBeUndefined();
  });

  it("un juego deshabilitado se encuentra pero no cuenta como habilitado", () => {
    const games = [{ ...ARCADE_GAMES[0], enabled: false }];
    expect(getArcadeGame("gusty-snake", games)).toBeDefined();
    expect(getEnabledArcadeGame("gusty-snake", games)).toBeUndefined();
  });

  it("el ranking de cada juego cuelga de su id", () => {
    expect(rankingHref(ARCADE_GAMES[0])).toBe("/arcade/gusty-snake/ranking");
  });
});
