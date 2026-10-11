import { describe, expect, it } from "vitest";
import { GUSTY_SNAKE_CONFIG as CONFIG } from "./config";
import { intervalForScore } from "./engine";
import { GustySession, MAX_QUEUED_TURNS } from "./session";
import { playWithBot } from "./testing";

// Con esta semilla la primera patita queda en (9, 23): lejos de la fila donde
// arranca la serpiente (y = 12), así que avanzar derecho no come nada.
const SEED = 12345;

function newSession() {
  return new GustySession(CONFIG, SEED);
}

describe("queueDirection", () => {
  it("descarta la misma dirección y el giro de 180°, acepta una perpendicular", () => {
    const session = newSession(); // mirando a la derecha
    expect(session.queueDirection("right")).toBe(false);
    expect(session.queueDirection("left")).toBe(false);
    expect(session.queueDirection("up")).toBe(true);
  });

  it("compara contra el último giro en espera, no contra la dirección actual", () => {
    const session = newSession();
    expect(session.queueDirection("up")).toBe(true);
    expect(session.queueDirection("up")).toBe(false); // igual que el último
    expect(session.queueDirection("down")).toBe(false); // 180° del último
    expect(session.queueDirection("left")).toBe(true); // perpendicular al último
  });

  it(`guarda como máximo ${MAX_QUEUED_TURNS} giros en espera`, () => {
    const session = newSession();
    expect(session.queueDirection("up")).toBe(true);
    expect(session.queueDirection("left")).toBe(true);
    expect(session.queueDirection("down")).toBe(true);
    expect(session.queueDirection("right")).toBe(false); // cola llena
  });

  it("no acepta nada con la partida terminada", () => {
    const session = newSession();
    while (session.state.status === "running") session.tick();
    expect(session.queueDirection("up")).toBe(false);
  });
});

describe("tick", () => {
  it("sin giros avanza derecho", () => {
    const session = newSession();
    session.tick();
    expect(session.state.snake[0]).toEqual({ x: 10, y: 12 });
    expect(session.state.direction).toBe("right");
    expect(session.state.ticks).toBe(1);
  });

  it("aplica un giro en espera por movimiento, en orden, y no pierde ninguno", () => {
    const session = newSession();
    session.queueDirection("up");
    session.queueDirection("left");

    session.tick();
    expect(session.state.direction).toBe("up");
    expect(session.state.snake[0]).toEqual({ x: 9, y: 11 });

    session.tick();
    expect(session.state.direction).toBe("left");
    expect(session.state.snake[0]).toEqual({ x: 8, y: 11 });

    // Cada giro quedó registrado en el movimiento en que se aplicó.
    expect(session.getReplay().turns).toEqual([
      [0, 0], // movimiento 0: arriba (código 0)
      [1, 3], // movimiento 1: izquierda (código 3)
    ]);
  });

  it("previousState es el estado anterior al último movimiento", () => {
    const session = newSession();
    const first = session.state;
    session.tick();
    expect(session.previousState).toBe(first);
    expect(session.state).not.toBe(first);
  });

  it("al chocar la partida termina y los tick siguientes no cambian nada", () => {
    const session = newSession();
    for (let i = 0; i < 9; i++) session.tick(); // 8 movimientos seguros y el 9° contra la pared
    expect(session.state.status).toBe("over");
    expect(session.state.overReason).toBe("wall");
    expect(session.state.ticks).toBe(9);

    const over = session.state;
    expect(session.tick()).toBe(over);
    expect(session.state.ticks).toBe(9);
  });
});

describe("intervalMs", () => {
  it("arranca en el intervalo inicial", () => {
    expect(newSession().intervalMs).toBe(CONFIG.initialIntervalMs);
  });

  it("acompaña al puntaje", () => {
    const session = playWithBot(CONFIG, SEED, 20_000);
    expect(session.state.score).toBeGreaterThan(0);
    expect(session.intervalMs).toBe(intervalForScore(session.state.score, CONFIG));
    expect(session.intervalMs).toBeLessThan(CONFIG.initialIntervalMs);
  });
});

describe("getReplay", () => {
  it("devuelve versión, semilla, movimientos y giros", () => {
    const session = newSession();
    session.queueDirection("down");
    session.tick();
    session.tick();
    expect(session.getReplay()).toEqual({
      v: CONFIG.version,
      seed: SEED,
      ticks: 2,
      turns: [[0, 2]],
    });
  });

  it("la semilla se guarda como entero de 32 bits sin signo", () => {
    expect(new GustySession(CONFIG, -1).seed).toBe(4294967295);
  });

  it("devuelve una copia: modificarla no afecta a la sesión", () => {
    const session = newSession();
    session.queueDirection("up");
    session.tick();
    const replay = session.getReplay();
    replay.turns.push([99, 1]);
    replay.turns[0][1] = 3;
    expect(session.getReplay().turns).toEqual([[0, 0]]);
  });
});
