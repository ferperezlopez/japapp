import { describe, expect, it } from "vitest";
import { calcularAsistencia } from "./attendance";

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
});
