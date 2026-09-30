import { describe, expect, it } from "vitest";
import { calcularAsistencia, contarEventosElegibles } from "./attendance";

describe("calcularAsistencia", () => {
  it("devuelve 0/0 y porcentaje null si no hay rsvps", () => {
    expect(calcularAsistencia([])).toEqual({
      juntada: { asistencias: 0, ausencias: 0, porcentaje: null },
      futbol: { asistencias: 0, ausencias: 0, porcentaje: null },
    });
  });

  it("cuenta yes como asistencia y no como ausencia, separado por kind", () => {
    const result = calcularAsistencia([
      { kind: "juntada", status: "yes" },
      { kind: "juntada", status: "yes" },
      { kind: "juntada", status: "no" },
      { kind: "futbol", status: "no" },
    ]);
    expect(result.juntada).toEqual({
      asistencias: 2,
      ausencias: 1,
      porcentaje: (2 / 3) * 100,
    });
    expect(result.futbol).toEqual({
      asistencias: 0,
      ausencias: 1,
      porcentaje: 0,
    });
  });

  it("maybe no suma a ninguno de los dos lados", () => {
    const result = calcularAsistencia([
      { kind: "juntada", status: "yes" },
      { kind: "juntada", status: "maybe" },
      { kind: "juntada", status: "maybe" },
    ]);
    expect(result.juntada).toEqual({
      asistencias: 1,
      ausencias: 0,
      porcentaje: 100,
    });
  });

  it("100% de asistencia si nunca faltó", () => {
    const result = calcularAsistencia([
      { kind: "futbol", status: "yes" },
      { kind: "futbol", status: "yes" },
    ]);
    expect(result.futbol.porcentaje).toBe(100);
  });

  it("0% de asistencia si siempre faltó", () => {
    const result = calcularAsistencia([
      { kind: "futbol", status: "no" },
      { kind: "futbol", status: "no" },
    ]);
    expect(result.futbol.porcentaje).toBe(0);
  });

  it("un evento ya ocurrido sin ninguna respuesta cuenta como ausencia", () => {
    const result = calcularAsistencia(
      [{ kind: "juntada", status: "yes" }],
      { juntada: 3, futbol: 0 },
    );
    // 1 evento respondido (yes) + 2 sin ninguna respuesta = 2 ausencias
    expect(result.juntada).toEqual({
      asistencias: 1,
      ausencias: 2,
      porcentaje: (1 / 3) * 100,
    });
  });

  it("maybe cuenta como 'respondido' — no se suma además como sin respuesta", () => {
    const result = calcularAsistencia(
      [{ kind: "juntada", status: "maybe" }],
      { juntada: 1, futbol: 0 },
    );
    expect(result.juntada).toEqual({ asistencias: 0, ausencias: 0, porcentaje: null });
  });

  it("no baja de 0 ausencias si hay más respuestas que eventos elegibles", () => {
    const result = calcularAsistencia(
      [
        { kind: "juntada", status: "yes" },
        { kind: "juntada", status: "no" },
      ],
      { juntada: 1, futbol: 0 },
    );
    expect(result.juntada).toEqual({ asistencias: 1, ausencias: 1, porcentaje: 50 });
  });

  it("sin el tercer parámetro, se comporta igual que antes (sin penalizar no-respuesta)", () => {
    const result = calcularAsistencia([{ kind: "juntada", status: "yes" }]);
    expect(result.juntada).toEqual({ asistencias: 1, ausencias: 0, porcentaje: 100 });
  });
});

describe("contarEventosElegibles", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("cuenta solo eventos pasados desde que la persona es miembro", () => {
    const result = contarEventosElegibles(
      [
        { eventDate: "2026-01-01T00:00:00Z", hasFutbol: false }, // antes de ser miembro
        { eventDate: "2026-02-01T00:00:00Z", hasFutbol: true }, // elegible
        { eventDate: "2026-03-01T00:00:00Z", hasFutbol: false }, // elegible
        { eventDate: "2026-12-01T00:00:00Z", hasFutbol: true }, // futuro, no cuenta
      ],
      "2026-01-15T00:00:00Z",
      now,
    );
    expect(result).toEqual({ juntada: 2, futbol: 1 });
  });

  it("devuelve 0/0 si no hay eventos elegibles", () => {
    expect(contarEventosElegibles([], "2026-01-01T00:00:00Z", now)).toEqual({
      juntada: 0,
      futbol: 0,
    });
  });
});
