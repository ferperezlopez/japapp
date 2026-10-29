import { describe, expect, it } from "vitest";
import {
  calcularAsistencia,
  contarEventosElegibles,
  filtrarRsvpsDeEventosPasados,
} from "./attendance";

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

describe("filtrarRsvpsDeEventosPasados", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const events = [
    { id: "viejo", eventDate: "2026-02-01T00:00:00Z" },
    { id: "ayer", eventDate: "2026-05-31T23:59:59Z" },
    { id: "ahora", eventDate: "2026-06-01T00:00:00Z" },
    { id: "proximo", eventDate: "2026-06-15T00:00:00Z" },
  ];
  const rsvp = (eventId: string, status: "yes" | "no" | "maybe" = "yes") => ({
    eventId,
    kind: "juntada" as const,
    status,
  });

  it("descarta las respuestas a eventos que todavía no pasaron", () => {
    const result = filtrarRsvpsDeEventosPasados([rsvp("viejo"), rsvp("proximo")], events, now);
    expect(result.map((r) => r.eventId)).toEqual(["viejo"]);
  });

  it("un evento que empieza justo ahora todavía no pasó (igual que al contar los elegibles)", () => {
    const result = filtrarRsvpsDeEventosPasados([rsvp("ayer"), rsvp("ahora")], events, now);
    expect(result.map((r) => r.eventId)).toEqual(["ayer"]);
    expect(contarEventosElegibles(events.map((e) => ({ ...e, hasFutbol: false })), "2026-01-01T00:00:00Z", now)).toEqual({
      juntada: 2,
      futbol: 0,
    });
  });

  it("descarta las respuestas a un evento que no está en la lista", () => {
    expect(filtrarRsvpsDeEventosPasados([rsvp("fantasma")], events, now)).toEqual([]);
  });

  it("conserva las respuestas tal cual, en su orden", () => {
    const mine = [rsvp("ayer", "no"), rsvp("viejo", "maybe"), rsvp("viejo", "yes")];
    expect(filtrarRsvpsDeEventosPasados(mine, events, now)).toEqual(mine);
  });

  it("sin eventos o sin respuestas, vacío", () => {
    expect(filtrarRsvpsDeEventosPasados([], events, now)).toEqual([]);
    expect(filtrarRsvpsDeEventosPasados([rsvp("viejo")], [], now)).toEqual([]);
  });

  it("un «Voy» al próximo evento no suma como asistencia ni tapa un evento pasado sin respuesta", () => {
    const eligible = contarEventosElegibles(
      events.map((e) => ({ ...e, hasFutbol: false })),
      "2026-01-01T00:00:00Z",
      now,
    );
    const rsvps = [rsvp("viejo"), rsvp("proximo")];
    // Sin filtrar: 2 «Voy» de 2 eventos pasados (el del próximo cuenta de más).
    expect(calcularAsistencia(rsvps, eligible).juntada).toEqual({
      asistencias: 2,
      ausencias: 0,
      porcentaje: 100,
    });
    // Filtrado: fue a 1 y al otro evento pasado (ayer) no respondió: 1 de 2.
    expect(calcularAsistencia(filtrarRsvpsDeEventosPasados(rsvps, events, now), eligible).juntada).toEqual({
      asistencias: 1,
      ausencias: 1,
      porcentaje: 50,
    });
  });
});
