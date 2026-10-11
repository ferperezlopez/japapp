import { describe, expect, it } from "vitest";
import { GUSTY_SNAKE_CONFIG as CONFIG } from "./config";
import { MAX_REPLAY_TICKS, parseReplay, verifyReplay, type Replay } from "./replay";
import { GustySession } from "./session";
import { chooseBotDirection, playUntilCheeseDeath, playWithBot } from "./testing";

const SEED = 12345;

/** Una partida real del bot (440 puntos, 788 movimientos, murió chocándose). */
function botGame() {
  const session = playWithBot(CONFIG, SEED, 20_000);
  return { session, replay: session.getReplay() };
}

describe("parseReplay", () => {
  const valid: Replay = { v: CONFIG.version, seed: 5, ticks: 10, turns: [[0, 0], [4, 3]] };

  it("acepta un replay bien formado y lo devuelve normalizado", () => {
    const result = parseReplay({ ...valid, ruido: "se ignora" });
    expect(result).toEqual({ ok: true, replay: valid });
  });

  it("acepta una partida sin giros y una de cero movimientos", () => {
    expect(parseReplay({ v: CONFIG.version, seed: 0, ticks: 0, turns: [] }).ok).toBe(true);
    expect(parseReplay({ v: CONFIG.version, seed: 4294967295, ticks: 9, turns: [] }).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["un string", "hola"],
    ["un número", 42],
    ["un array", []],
    ["versión 0", { ...valid, v: 0 }],
    ["versión decimal", { ...valid, v: 1.5 }],
    ["versión como string", { ...valid, v: "1" }],
    ["semilla negativa", { ...valid, seed: -1 }],
    ["semilla mayor a 32 bits", { ...valid, seed: 4294967296 }],
    ["semilla decimal", { ...valid, seed: 1.5 }],
    ["movimientos negativos", { ...valid, ticks: -1 }],
    ["movimientos de más", { ...valid, ticks: MAX_REPLAY_TICKS + 1 }],
    ["movimientos NaN", { ...valid, ticks: Number.NaN }],
    ["giros que no son un array", { ...valid, turns: "no" }],
    ["más giros que movimientos", { ...valid, ticks: 1, turns: [[0, 0], [1, 1]] }],
    ["un giro mal formado", { ...valid, turns: [[0]] }],
    ["un giro que no es un array", { ...valid, turns: [7] }],
    ["un giro con tres elementos", { ...valid, turns: [[0, 0, 0]] }],
    ["un giro con valores decimales", { ...valid, turns: [[0.5, 0]] }],
    ["giros repetidos en el mismo movimiento", { ...valid, turns: [[2, 0], [2, 1]] }],
    ["giros desordenados", { ...valid, turns: [[4, 0], [2, 1]] }],
    ["un giro negativo", { ...valid, turns: [[-1, 0]] }],
    ["un giro fuera de la partida", { ...valid, turns: [[10, 0]] }],
    ["una dirección que no existe", { ...valid, turns: [[0, 4]] }],
    ["una dirección negativa", { ...valid, turns: [[0, -1]] }],
  ])("rechaza %s", (_name, input) => {
    expect(parseReplay(input).ok).toBe(false);
  });
});

describe("verifyReplay", () => {
  it("una partida real vuelve a dar el mismo resultado al simularla de nuevo", () => {
    const { session, replay } = botGame();
    expect(session.state.score).toBe(440);

    // Pasa por JSON, como viaja al servidor.
    const parsed = parseReplay(JSON.parse(JSON.stringify(replay)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = verifyReplay(CONFIG, parsed.replay);
    expect(result).toMatchObject({
      ok: true,
      score: session.state.score,
      ticks: session.state.ticks,
      over: true,
      overReason: "self",
    });
  });

  it("el tiempo mínimo coincide con lo que mide el juego movimiento a movimiento", () => {
    // Misma cuenta que hace el runner: antes de cada movimiento espera el
    // intervalo que corresponde al puntaje de ese momento.
    const session = new GustySession(CONFIG, SEED);
    let expectedMs = 0;
    while (session.state.status === "running" && session.state.ticks < 20_000) {
      const direction = chooseBotDirection(session.state, CONFIG);
      if (direction !== session.state.direction) session.queueDirection(direction);
      expectedMs += session.intervalMs;
      session.tick();
    }
    const result = verifyReplay(CONFIG, session.getReplay());
    expect(result.ok && result.minDurationMs).toBe(expectedMs);
    // Y es consistente con la curva: 788 movimientos, más rápidos al ir sumando.
    const ticks = session.state.ticks;
    expect(expectedMs).toBeGreaterThan(ticks * CONFIG.minIntervalMs);
    expect(expectedMs).toBeLessThan(ticks * CONFIG.initialIntervalMs);
  });

  it("acepta una partida abandonada: un tramo de una partida válida", () => {
    const { replay } = botGame();
    const prefix: Replay = {
      ...replay,
      ticks: 100,
      turns: replay.turns.filter(([tick]) => tick < 100),
    };
    const result = verifyReplay(CONFIG, prefix);
    const reference = playWithBot(CONFIG, SEED, 100);
    expect(result).toMatchObject({
      ok: true,
      ticks: 100,
      over: false,
      score: reference.state.score,
    });
  });

  it("rechaza movimientos de más después de que la serpiente murió", () => {
    const { replay } = botGame();
    const result = verifyReplay(CONFIG, { ...replay, ticks: replay.ticks + 1 });
    expect(result.ok).toBe(false);
  });

  it("una semilla distinta no reproduce la misma partida", () => {
    const { session, replay } = botGame();
    const result = verifyReplay(CONFIG, { ...replay, seed: replay.seed + 1 });
    const identical =
      result.ok && result.score === session.state.score && result.ticks === session.state.ticks;
    expect(identical).toBe(false);
  });

  it("rechaza un giro de 180°", () => {
    // Arranca a la derecha: girar a la izquierda (código 3) es invertir el sentido.
    const result = verifyReplay(CONFIG, { v: CONFIG.version, seed: SEED, ticks: 5, turns: [[0, 3]] });
    expect(result).toEqual({ ok: false, error: "Giro inválido en el movimiento 0." });
  });

  it("rechaza un giro hacia la dirección en la que ya va", () => {
    const result = verifyReplay(CONFIG, { v: CONFIG.version, seed: SEED, ticks: 5, turns: [[0, 1]] });
    expect(result.ok).toBe(false);
  });

  it("rechaza giros que nunca se pudieron aplicar", () => {
    // Sin parseReplay de por medio: el giro del movimiento 5 cae fuera de los 3 movimientos.
    const result = verifyReplay(CONFIG, { v: CONFIG.version, seed: SEED, ticks: 3, turns: [[5, 0]] });
    expect(result.ok).toBe(false);
  });

  it("rechaza un replay de otra versión del juego", () => {
    const { replay } = botGame();
    const result = verifyReplay(CONFIG, { ...replay, v: CONFIG.version + 1 });
    expect(result).toEqual({ ok: false, error: "La versión del juego no coincide." });
  });

  it("rechaza un replay de la versión 1 (Gusty Snake, antes del queso y las tres comidas)", () => {
    const { replay } = botGame();
    expect(CONFIG.version).toBeGreaterThan(1);
    expect(verifyReplay(CONFIG, { ...replay, v: 1 })).toEqual({
      ok: false,
      error: "La versión del juego no coincide.",
    });
  });

  it("una partida que terminó tocando el queso se vuelve a simular igual", () => {
    let found: ReturnType<typeof playUntilCheeseDeath> = null;
    for (let seed = 1; seed <= 200 && found === null; seed++) {
      found = playUntilCheeseDeath(CONFIG, seed, 3000);
    }
    expect(found).not.toBeNull();
    const session = found!;
    expect(session.state.overReason).toBe("cheese");
    expect(session.state.score).toBeGreaterThanOrEqual(CONFIG.cheese.startScore);

    // Pasa por JSON, como viaja al servidor.
    const parsed = parseReplay(JSON.parse(JSON.stringify(session.getReplay())));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(verifyReplay(CONFIG, parsed.replay)).toMatchObject({
      ok: true,
      score: session.state.score,
      ticks: session.state.ticks,
      over: true,
      overReason: "cheese",
    });
    // Y seguir después de morir por queso también se rechaza.
    expect(verifyReplay(CONFIG, { ...parsed.replay, ticks: parsed.replay.ticks + 1 }).ok).toBe(false);
  });

  it("una partida sin movimientos es válida y vale 0 puntos", () => {
    const result = verifyReplay(CONFIG, { v: CONFIG.version, seed: SEED, ticks: 0, turns: [] });
    expect(result).toEqual({
      ok: true,
      score: 0,
      ticks: 0,
      over: false,
      overReason: null,
      minDurationMs: 0,
    });
  });

  it("simular el máximo de movimientos permitido es rápido", () => {
    // Acota el trabajo que un atacante puede pedirle al servidor: una
    // serpiente que da vueltas en un cuadrado de 2x2 sobrevive indefinidamente
    // (abajo, izquierda, arriba, derecha, y otra vez), así que sirve para
    // simular la partida más larga que acepta el servidor.
    const loop = [2, 3, 0, 1]; // códigos: abajo, izquierda, arriba, derecha
    const turns: [number, number][] = [];
    for (let tick = 0; tick < MAX_REPLAY_TICKS; tick++) turns.push([tick, loop[tick % 4]]);
    const replay: Replay = { v: CONFIG.version, seed: SEED, ticks: MAX_REPLAY_TICKS, turns };

    const parsed = parseReplay(JSON.parse(JSON.stringify(replay)));
    expect(parsed.ok).toBe(true);

    const started = performance.now();
    const result = verifyReplay(CONFIG, replay);
    const elapsedMs = performance.now() - started;

    expect(result).toMatchObject({ ok: true, score: 0, ticks: MAX_REPLAY_TICKS, over: false });
    expect(elapsedMs).toBeLessThan(1000);
  });
});
