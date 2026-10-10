import { describe, expect, it } from "vitest";
import { SWIPE_THRESHOLD_PX, SwipeTracker, directionFromDelta } from "./swipe";

describe("directionFromDelta", () => {
  it("devuelve la dirección del eje dominante", () => {
    expect(directionFromDelta(40, 5)).toBe("right");
    expect(directionFromDelta(-40, 5)).toBe("left");
    expect(directionFromDelta(5, 40)).toBe("down");
    expect(directionFromDelta(5, -40)).toBe("up");
  });

  it("un desplazamiento corto no cuenta", () => {
    expect(directionFromDelta(SWIPE_THRESHOLD_PX - 1, 0)).toBeNull();
    expect(directionFromDelta(0, -(SWIPE_THRESHOLD_PX - 1))).toBeNull();
    expect(directionFromDelta(0, 0)).toBeNull();
  });

  it("justo el umbral ya cuenta", () => {
    expect(directionFromDelta(SWIPE_THRESHOLD_PX, 0)).toBe("right");
  });

  it("en una diagonal exacta manda el eje vertical", () => {
    expect(directionFromDelta(30, 30)).toBe("down");
    expect(directionFromDelta(-30, -30)).toBe("up");
  });

  it("acepta otro umbral", () => {
    expect(directionFromDelta(10, 0, 8)).toBe("right");
    expect(directionFromDelta(10, 0, 12)).toBeNull();
  });

  it("ignora valores inválidos", () => {
    expect(directionFromDelta(Number.NaN, 0)).toBeNull();
    expect(directionFromDelta(0, Number.NaN)).toBeNull();
  });
});

describe("SwipeTracker", () => {
  it("reconoce un giro cuando el dedo supera el umbral", () => {
    const tracker = new SwipeTracker();
    tracker.start(100, 100);
    expect(tracker.move(110, 101)).toBeNull();
    expect(tracker.move(125, 102)).toBe("right");
  });

  it("es continuo: varios giros en un mismo gesto, sin levantar el dedo", () => {
    const tracker = new SwipeTracker();
    tracker.start(100, 100);
    expect(tracker.move(100, 70)).toBe("up");
    // El origen pasó a (100, 70): ahora hacia la izquierda.
    expect(tracker.move(70, 72)).toBe("left");
    // Y de nuevo hacia abajo.
    expect(tracker.move(68, 100)).toBe("down");
  });

  it("después de reconocer un giro no repite hasta que el dedo avance otro umbral", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    expect(tracker.move(25, 0)).toBe("right");
    expect(tracker.move(30, 0)).toBeNull();
    expect(tracker.move(50, 0)).toBe("right");
  });

  it("sin dedo apoyado no reconoce nada", () => {
    const tracker = new SwipeTracker();
    expect(tracker.move(500, 500)).toBeNull();
  });

  it("al levantar el dedo termina el gesto", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    tracker.end();
    expect(tracker.move(100, 0)).toBeNull();
  });

  it("un gesto nuevo arranca desde su propio origen", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    tracker.move(40, 0);
    tracker.end();
    tracker.start(200, 200);
    expect(tracker.move(205, 205)).toBeNull();
    expect(tracker.move(200, 240)).toBe("down");
  });
});
