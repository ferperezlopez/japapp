import { describe, expect, it } from "vitest";
import { buildAnalytics } from "./build";
import { buildEventList } from "./eventList";
import { NOW, event, expense, member, rsvp } from "./fixtures";
import { formatDayLong } from "./format";

const analytics = buildAnalytics({
  now: NOW,
  members: [member("a"), member("b"), member("c")],
  events: [
    event("antes", "2025-12-01T20:00:00Z", { name: "Antes de todos" }),
    event("e1", "2026-09-18T19:30:00Z", { hasFutbol: true, groupId: "g1", name: "JAPA primaveral" }),
    event("e2", "2026-10-02T20:00:00Z", { name: "JAPA de octubre" }),
    event("e3", "2026-10-30T20:00:00Z", { hasFutbol: true, name: "JAPA próxima" }),
  ],
  rsvps: [
    rsvp("e1", "a", "yes"),
    rsvp("e1", "b", "yes"),
    rsvp("e1", "c", "no"),
    rsvp("e2", "a", "yes"),
    rsvp("e3", "a", "yes"),
    rsvp("e3", "c", "yes"),
  ],
  guests: [],
  expenses: [expense("x1", "g1", "a", 300, ["a", "b", "c"])],
  payments: [],
  futbol: [],
  tasks: [],
});

describe("buildEventList", () => {
  const items = buildEventList(analytics.events);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  it("conserva el orden: el próximo primero y después del más reciente al más viejo", () => {
    expect(items.map((i) => i.id)).toEqual(["e3", "e2", "e1", "antes"]);
  });

  it("lleva lo que el buscador necesita para filtrar", () => {
    expect(byId.e1).toMatchObject({
      id: "e1",
      name: "JAPA primaveral",
      eventDate: "2026-09-18T19:30:00Z",
      hasFutbol: true,
      status: "past",
    });
    expect(byId.e3.status).toBe("next");
    expect(byId.e2.hasFutbol).toBe(false);
  });

  it("la fecha sale formateada, en hora de Argentina", () => {
    expect(byId.e1.dateLabel).toBe(formatDayLong("2026-09-18T19:30:00Z"));
  });

  it("asistencia: cuántos de cuántos y el porcentaje", () => {
    expect(byId.e1.attendanceLabel).toBe("2 de 3 confirmaron (67%)");
    expect(byId.e3.attendanceLabel).toBe("2 de 3 confirmaron (67%)");
  });

  it("con uno solo, en singular", () => {
    expect(byId.e2.attendanceLabel).toBe("1 de 3 confirmó (33%)");
  });

  it("sin nadie a quien exigirle respuesta no hay porcentaje", () => {
    expect(byId.antes.attendanceLabel).toBe("0 de 0 confirmaron");
  });

  it("gastos: total y costo por persona; sin gastos es null", () => {
    expect(byId.e1.spendingLabel).toBe("$300 · $100 por persona");
    expect(byId.e2.spendingLabel).toBeNull();
    expect(byId.e3.spendingLabel).toBeNull();
  });
});
