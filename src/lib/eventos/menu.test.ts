import { describe, expect, it } from "vitest";
import {
  MAX_MENU_LENGTH,
  formatDaysAgo,
  menuIcon,
  normalizeMenu,
  parseMenu,
  suggestMenus,
} from "./menu";

describe("normalizeMenu", () => {
  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(normalizeMenu("  Choripán  ")).toBe("choripan");
    expect(normalizeMenu("ASADO")).toBe("asado");
    expect(normalizeMenu("Milanesas   con   puré")).toBe("milanesas con pure");
  });
});

describe("parseMenu", () => {
  it("vacío o solo espacios es «sin menú»", () => {
    expect(parseMenu(null)).toEqual({ ok: true, menu: null });
    expect(parseMenu("")).toEqual({ ok: true, menu: null });
    expect(parseMenu("   ")).toEqual({ ok: true, menu: null });
  });

  it("un menú de la lista se guarda con su escritura canónica, sin importar cómo se escribió", () => {
    expect(parseMenu("asado")).toEqual({ ok: true, menu: "Asado" });
    expect(parseMenu("  EMPANADAS ")).toEqual({ ok: true, menu: "Empanadas" });
    expect(parseMenu("hamburguesas")).toEqual({ ok: true, menu: "Hamburguesas" });
  });

  it("uno escrito a mano se guarda tal cual, con los espacios colapsados", () => {
    expect(parseMenu("  Choripán   y  morcilla ")).toEqual({ ok: true, menu: "Choripán y morcilla" });
  });

  it("acepta justo el largo máximo y rechaza uno más", () => {
    expect(parseMenu("x".repeat(MAX_MENU_LENGTH))).toEqual({ ok: true, menu: "x".repeat(MAX_MENU_LENGTH) });
    expect(parseMenu("x".repeat(MAX_MENU_LENGTH + 1))).toEqual({
      ok: false,
      error: `El menú puede tener hasta ${MAX_MENU_LENGTH} caracteres.`,
    });
  });
});

describe("menuIcon", () => {
  it("devuelve el emoji de uno de la lista y null para otro", () => {
    expect(menuIcon("Asado")).toBe("🥩");
    expect(menuIcon("empanadas")).toBe("🥟");
    expect(menuIcon("Choripán")).toBeNull();
  });
});

describe("suggestMenus", () => {
  // Hoy es 1/11/2026 al mediodía en Buenos Aires.
  const NOW = new Date("2026-11-01T15:00:00Z");
  const history = [
    { menu: "Empanadas", eventDate: "2026-09-18T19:30:00+00:00" },
    { menu: "Asado", eventDate: "2026-10-02T20:00:00+00:00" },
    { menu: "Asado", eventDate: "2026-10-16T19:20:00+00:00" },
    { menu: "Asado", eventDate: "2026-10-30T20:00:00+00:00" },
  ];

  it("ordena del que hace más tiempo que no se hace al más reciente", () => {
    expect(suggestMenus(history, NOW)).toEqual([
      { menu: "Empanadas", icon: "🥟", daysAgo: 44, times: 1 },
      { menu: "Asado", icon: "🥩", daysAgo: 2, times: 3 },
    ]);
  });

  it("cuenta cuántas veces se hizo cada uno y toma la fecha de la última", () => {
    const [, asado] = suggestMenus(history, NOW);
    expect(asado.times).toBe(3);
    expect(asado.daysAgo).toBe(2); // 30/10, no el 2/10
  });

  it("sin historial con menú no sugiere nada", () => {
    expect(suggestMenus([], NOW)).toEqual([]);
    expect(suggestMenus([{ menu: null, eventDate: "2026-10-02T20:00:00+00:00" }], NOW)).toEqual([]);
  });

  it("ignora los eventos que todavía no pasaron", () => {
    const withFuture = [...history, { menu: "Pizza", eventDate: "2026-11-20T20:00:00+00:00" }];
    expect(suggestMenus(withFuture, NOW).map((s) => s.menu)).not.toContain("Pizza");
  });

  it("un evento de hoy cuenta como hecho hace 0 días", () => {
    const today = [{ menu: "Pizza", eventDate: "2026-11-01T12:00:00+00:00" }];
    expect(suggestMenus(today, NOW)).toEqual([{ menu: "Pizza", icon: "🍕", daysAgo: 0, times: 1 }]);
  });

  it("agrupa «asado» y «Asado » como el mismo menú", () => {
    const messy = [
      { menu: "asado", eventDate: "2026-10-02T20:00:00+00:00" },
      { menu: " Asado ", eventDate: "2026-10-16T20:00:00+00:00" },
    ];
    const result = suggestMenus(messy, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ menu: "Asado", times: 2, daysAgo: 16 });
  });

  it("agrupa también un menú escrito a mano sin importar tildes y muestra la escritura más reciente", () => {
    const messy = [
      { menu: "Choripan", eventDate: "2026-09-01T20:00:00+00:00" },
      { menu: "Choripán", eventDate: "2026-10-01T20:00:00+00:00" },
    ];
    expect(suggestMenus(messy, NOW)).toEqual([{ menu: "Choripán", icon: null, daysAgo: 31, times: 2 }]);
  });

  it("a igual antigüedad va primero el que más se hizo, y después el orden alfabético", () => {
    const tie = [
      { menu: "Pizza", eventDate: "2026-10-01T20:00:00+00:00" },
      { menu: "Pastas", eventDate: "2026-10-01T20:00:00+00:00" },
      { menu: "Pastas", eventDate: "2026-09-01T20:00:00+00:00" },
      { menu: "Hamburguesas", eventDate: "2026-10-01T20:00:00+00:00" },
    ];
    expect(suggestMenus(tie, NOW).map((s) => s.menu)).toEqual(["Pastas", "Hamburguesas", "Pizza"]);
  });

  it("respeta el límite", () => {
    const many = ["Asado", "Pizza", "Pastas", "Empanadas", "Hamburguesas"].map((menu, i) => ({
      menu,
      eventDate: `2026-10-0${i + 1}T20:00:00+00:00`,
    }));
    expect(suggestMenus(many, NOW)).toHaveLength(4);
    expect(suggestMenus(many, NOW, 2)).toHaveLength(2);
    // Los dos que hace más que no se hacen.
    expect(suggestMenus(many, NOW, 2).map((s) => s.menu)).toEqual(["Asado", "Pizza"]);
  });

  it("cuenta los días de calendario en Buenos Aires: a la noche de Buenos Aires ya es otro día en UTC", () => {
    // 2/11 01:00 UTC = 1/11 22:00 en Buenos Aires: el evento del 30/10 sigue siendo de hace 2 días.
    const late = new Date("2026-11-02T01:00:00Z");
    expect(suggestMenus([{ menu: "Asado", eventDate: "2026-10-30T20:00:00+00:00" }], late)[0].daysAgo).toBe(2);
  });
});

describe("formatDaysAgo", () => {
  it.each([
    [0, "hoy"],
    [-3, "hoy"],
    [1, "ayer"],
    [2, "hace 2 días"],
    [13, "hace 13 días"],
    [14, "hace 2 semanas"],
    [44, "hace 6 semanas"],
    [59, "hace 8 semanas"],
    [60, "hace 2 meses"],
    [200, "hace 6 meses"],
    [359, "hace 11 meses"],
    [360, "hace más de un año"],
    [800, "hace más de un año"],
  ])("%i días → %s", (days, text) => {
    expect(formatDaysAgo(days)).toBe(text);
  });
});
