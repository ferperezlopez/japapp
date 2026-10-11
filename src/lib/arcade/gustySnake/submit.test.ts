import { describe, expect, it } from "vitest";
import { GUSTY_SNAKE_CONFIG as CONFIG } from "./config";
import { verifyReplay } from "./replay";
import { GustySession } from "./session";
import { playWithBot } from "./testing";
import {
  DURATION_TOLERANCE_MS,
  MAX_DURATION_MS,
  validateSubmission,
  type ValidatedRun,
} from "./submit";

const SEED = 12345;
const RUN_ID = "3f2b8c1e-6a4d-4e0b-9c57-1d2e3f4a5b6c";

/** Una partida real: 230 puntos, 319 movimientos, murió chocándose. */
function botRun() {
  const session = playWithBot(CONFIG, SEED, 20_000);
  const replay = session.getReplay();
  const verified = verifyReplay(CONFIG, replay);
  if (!verified.ok) throw new Error("el replay del bot debería ser válido");
  return {
    replay,
    score: session.state.score,
    minDurationMs: verified.minDurationMs,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  const { replay, score, minDurationMs } = botRun();
  return {
    clientRunId: RUN_ID,
    replay,
    score,
    durationMs: minDurationMs + 1500,
    ...overrides,
  };
}

function expectError(result: ReturnType<typeof validateSubmission>, pattern?: RegExp) {
  expect(result.ok).toBe(false);
  if (!result.ok && pattern) expect(result.error).toMatch(pattern);
}

describe("validateSubmission", () => {
  it("acepta una partida legítima y devuelve los números recalculados", () => {
    const result = validateSubmission(input(), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const run: ValidatedRun = result.run;
    expect(run.score).toBe(230);
    expect(run.ticks).toBe(319);
    expect(run.over).toBe(true);
    expect(run.clientRunId).toBe(RUN_ID);
  });

  it("sobrevive al viaje por JSON", () => {
    const sent = JSON.parse(JSON.stringify(input()));
    expect(validateSubmission(sent, CONFIG).ok).toBe(true);
  });

  it("guarda el identificador de partida en minúsculas", () => {
    const result = validateSubmission(input({ clientRunId: RUN_ID.toUpperCase() }), CONFIG);
    expect(result.ok && result.run.clientRunId).toBe(RUN_ID);
  });

  describe("puntaje", () => {
    it("rechaza un puntaje inflado (el caso de editar el número en DevTools)", () => {
      expectError(validateSubmission(input({ score: 99_999 }), CONFIG), /puntaje/i);
      expectError(validateSubmission(input({ score: 240 }), CONFIG), /puntaje/i);
    });

    it("rechaza un puntaje menor al real", () => {
      expectError(validateSubmission(input({ score: 220 }), CONFIG), /puntaje/i);
    });

    it.each([
      ["negativo", -10],
      ["decimal", 230.5],
      ["texto", "230"],
      ["NaN", Number.NaN],
      ["nulo", null],
    ])("rechaza un puntaje %s", (_name, score) => {
      expectError(validateSubmission(input({ score }), CONFIG), /puntaje/i);
    });
  });

  describe("duración", () => {
    it("acepta justo el mínimo posible", () => {
      const { minDurationMs } = botRun();
      expect(validateSubmission(input({ durationMs: minDurationMs }), CONFIG).ok).toBe(true);
    });

    it("tolera un pequeño margen de medición", () => {
      const { minDurationMs } = botRun();
      const durationMs = minDurationMs - DURATION_TOLERANCE_MS;
      expect(validateSubmission(input({ durationMs }), CONFIG).ok).toBe(true);
    });

    it("rechaza una duración imposible para esa cantidad de movimientos", () => {
      const { minDurationMs } = botRun();
      const durationMs = minDurationMs - DURATION_TOLERANCE_MS - 1;
      expectError(validateSubmission(input({ durationMs }), CONFIG), /duración/i);
      expectError(validateSubmission(input({ durationMs: 1000 }), CONFIG), /duración/i);
      expectError(validateSubmission(input({ durationMs: 0 }), CONFIG), /duración/i);
    });

    it.each([
      ["negativa", -1],
      ["decimal", 1000.5],
      ["texto", "60000"],
      ["mayor a 24 horas", MAX_DURATION_MS + 1],
      ["nula", null],
    ])("rechaza una duración %s", (_name, durationMs) => {
      expectError(validateSubmission(input({ durationMs }), CONFIG), /duración/i);
    });
  });

  describe("identificador de partida", () => {
    it.each([
      ["vacío", ""],
      ["texto cualquiera", "hola"],
      ["un uuid con un caracter de más", `${RUN_ID}0`],
      ["un número", 123],
      ["nulo", null],
    ])("rechaza uno %s", (_name, clientRunId) => {
      expectError(validateSubmission(input({ clientRunId }), CONFIG), /identificador/i);
    });
  });

  describe("registro de la partida", () => {
    it("rechaza un replay de otra versión del juego", () => {
      const { replay } = botRun();
      expectError(
        validateSubmission(input({ replay: { ...replay, v: CONFIG.version + 1 } }), CONFIG),
        /versión/i,
      );
    });

    it("rechaza un replay con una semilla alterada", () => {
      const { replay } = botRun();
      const tampered = validateSubmission(input({ replay: { ...replay, seed: replay.seed + 1 } }), CONFIG);
      expect(tampered.ok).toBe(false);
    });

    it("rechaza un replay con un giro de 180° agregado", () => {
      const tampered = { v: 1, seed: SEED, ticks: 5, turns: [[0, 3]] };
      expectError(validateSubmission(input({ replay: tampered, score: 0 }), CONFIG), /giro/i);
    });

    it("rechaza movimientos de más después de la muerte", () => {
      const { replay } = botRun();
      expect(
        validateSubmission(input({ replay: { ...replay, ticks: replay.ticks + 5 } }), CONFIG).ok,
      ).toBe(false);
    });

    it("rechaza un replay mal formado", () => {
      expectError(validateSubmission(input({ replay: "no soy un replay" }), CONFIG));
      expectError(validateSubmission(input({ replay: null }), CONFIG));
      expectError(validateSubmission(input({ replay: { v: 1 } }), CONFIG));
    });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["un string", "hola"],
    ["un array", []],
    ["un objeto vacío", {}],
  ])("rechaza %s como envío", (_name, value) => {
    expectError(validateSubmission(value, CONFIG));
  });

  it("acepta una partida abandonada a la mitad (todavía no terminó)", () => {
    const session = new GustySession(CONFIG, SEED);
    session.queueDirection("down");
    for (let i = 0; i < 4; i++) session.tick();
    const replay = session.getReplay();
    const verified = verifyReplay(CONFIG, replay);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const result = validateSubmission(
      { clientRunId: RUN_ID, replay, score: 0, durationMs: verified.minDurationMs + 200 },
      CONFIG,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.over).toBe(false);
      expect(result.run.score).toBe(0);
      expect(result.run.ticks).toBe(4);
    }
  });
});
