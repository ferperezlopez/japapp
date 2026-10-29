import { describe, expect, it } from "vitest";
import {
  eventFilterOptions,
  eventSearchText,
  filterEvents,
  normalizeText,
  type SearchableEvent,
} from "./eventSearch";

const ev = (id: string, name: string, eventDate: string, hasFutbol: boolean): SearchableEvent => ({
  id,
  name,
  eventDate,
  hasFutbol,
});

// Lista del más reciente al más viejo, como la muestra la pantalla.
const events: SearchableEvent[] = [
  ev("e5", "Cena de cierre", "2026-11-01T00:30:00Z", false), // 21:30 del 31/10 en Argentina
  ev("e4", "JAPA muchaaaaachos", "2026-10-30T20:00:00Z", true),
  ev("e3", "JAPA + Cumple Tato 🎂", "2026-10-16T19:20:00Z", false),
  ev("e2", "JAPA primaveral 🌹", "2026-10-02T20:00:00Z", true),
  ev("e1", "JAPA de empanadas y apps", "2026-09-18T19:30:00Z", true),
];
const found = (query: string, filter = "all") => filterEvents(events, query, filter).map((e) => e.id);

describe("normalizeText", () => {
  it("minúsculas, sin acentos y con los espacios colapsados", () => {
    expect(normalizeText("  Cumpleaños   de ÁLVARO ")).toBe("cumpleanos de alvaro");
    expect(normalizeText("Sábado")).toBe("sabado");
    expect(normalizeText("")).toBe("");
  });
});

describe("eventSearchText", () => {
  it("incluye las formas en que se puede escribir la fecha, en hora de Argentina", () => {
    const text = eventSearchText(events[2]); // 16/10
    for (const part of ["16/10", "16/10/2026", "2026-10-16", "16 oct", "octubre", "oct", "2026", "viernes", "vie"]) {
      expect(text, part).toContain(part);
    }
  });

  it("un evento de las 21:30 (00:30 UTC del día siguiente) conserva su día de Argentina", () => {
    const text = eventSearchText(events[0]);
    expect(text).toContain("31/10/2026");
    expect(text).toContain("sabado");
    expect(text).not.toContain("1/11/2026");
  });

  it("el día lleva cero adelante (02/10), así que «02/10» y «2/10» lo encuentran", () => {
    const text = eventSearchText(events[3]);
    expect(text).toContain("02/10/2026");
    expect(text).toContain("02 oct");
    expect(text).toContain("02 de octubre de 2026");
  });
});

describe("filterEvents · búsqueda", () => {
  it("por nombre, sin importar mayúsculas ni acentos", () => {
    expect(found("tato")).toEqual(["e3"]);
    expect(found("CUMPLE")).toEqual(["e3"]);
    expect(found("empanadas")).toEqual(["e1"]);
    expect(found("primaveral")).toEqual(["e2"]);
  });

  it("por mes: «oct», «octubre» (con el cierre de las 21:30 del 31/10) y «sep»", () => {
    expect(found("oct")).toEqual(["e5", "e4", "e3", "e2"]);
    expect(found("octubre")).toEqual(["e5", "e4", "e3", "e2"]);
    expect(found("sep")).toEqual(["e1"]);
  });

  it("por fecha: «16/10», «02/10» y «2/10» encuentran el mismo evento", () => {
    expect(found("16/10")).toEqual(["e3"]);
    expect(found("02/10")).toEqual(["e2"]);
    expect(found("2/10")).toEqual(["e2"]);
    expect(found("2026-10-16")).toEqual(["e3"]);
    expect(found("16 oct")).toEqual(["e3"]);
  });

  it("por día de la semana y por año", () => {
    expect(found("viernes")).toEqual(["e4", "e3", "e2", "e1"]);
    expect(found("sabado")).toEqual(["e5"]);
    expect(found("2026")).toHaveLength(5);
    expect(found("2025")).toEqual([]);
  });

  it("varias palabras: todas tienen que aparecer (nombre y fecha juntos)", () => {
    expect(found("cumple oct")).toEqual(["e3"]);
    expect(found("cumple sep")).toEqual([]);
    expect(found("octubre 2026")).toEqual(["e5", "e4", "e3", "e2"]);
  });

  it("sin texto devuelve todo y conserva el orden; sin coincidencias, nada", () => {
    expect(found("")).toEqual(["e5", "e4", "e3", "e2", "e1"]);
    expect(found("   ")).toEqual(["e5", "e4", "e3", "e2", "e1"]);
    expect(found("zzzz")).toEqual([]);
  });
});

describe("filterEvents · filtro del desplegable", () => {
  it("con fútbol y sin fútbol", () => {
    expect(found("", "futbol")).toEqual(["e4", "e2", "e1"]);
    expect(found("", "sin-futbol")).toEqual(["e5", "e3"]);
  });

  it("por año y por mes (el mes cuenta en hora de Argentina: el cierre es de octubre)", () => {
    expect(found("", "year:2026")).toHaveLength(5);
    expect(found("", "year:2025")).toEqual([]);
    expect(found("", "month:2026-10")).toEqual(["e5", "e4", "e3", "e2"]);
    expect(found("", "month:2026-09")).toEqual(["e1"]);
    expect(found("", "month:2026-11")).toEqual([]);
  });

  it("se combina con la búsqueda", () => {
    expect(found("oct", "futbol")).toEqual(["e4", "e2"]);
    expect(found("tato", "futbol")).toEqual([]);
  });

  it("un filtro desconocido no filtra", () => {
    expect(found("", "cualquier-cosa")).toHaveLength(5);
    expect(found("", "all")).toHaveLength(5);
  });
});

describe("eventFilterOptions", () => {
  it("todos, tipos, años y meses (del más reciente al más viejo) con su cantidad", () => {
    expect(eventFilterOptions(events).map((o) => [o.value, o.label, o.group, o.count])).toEqual([
      ["all", "Todos los eventos", null, 5],
      ["futbol", "Con fútbol", "Tipo", 3],
      ["sin-futbol", "Sin fútbol", "Tipo", 2],
      ["year:2026", "2026", "Año", 5],
      ["month:2026-10", "octubre 2026", "Mes", 4],
      ["month:2026-09", "septiembre 2026", "Mes", 1],
    ]);
  });

  it("no ofrece un tipo que no tiene eventos", () => {
    const onlyFutbol = events.filter((e) => e.hasFutbol);
    expect(eventFilterOptions(onlyFutbol).map((o) => o.value)).not.toContain("sin-futbol");
    const none = events.filter((e) => !e.hasFutbol);
    expect(eventFilterOptions(none).map((o) => o.value)).not.toContain("futbol");
  });

  it("varios años: el más reciente primero", () => {
    const options = eventFilterOptions([
      ev("a", "A", "2025-12-20T20:00:00Z", true),
      ev("b", "B", "2026-01-10T20:00:00Z", true),
    ]);
    expect(options.filter((o) => o.group === "Año").map((o) => o.value)).toEqual(["year:2026", "year:2025"]);
    expect(options.filter((o) => o.group === "Mes").map((o) => o.value)).toEqual(["month:2026-01", "month:2025-12"]);
  });

  it("sin eventos solo queda «Todos»", () => {
    expect(eventFilterOptions([]).map((o) => o.value)).toEqual(["all"]);
  });

  it("cada opción filtra exactamente la cantidad que dice", () => {
    for (const option of eventFilterOptions(events)) {
      expect(filterEvents(events, "", option.value), option.value).toHaveLength(option.count);
    }
  });
});
