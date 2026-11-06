import { describe, expect, it } from "vitest";
import {
  buildTasksShareText,
  confirmedMembers,
  groupByPerson,
  itemWithQuantity,
  UNNAMED_ITEM_LABEL,
  type ShareTask,
} from "./tasksShare";

describe("confirmedMembers", () => {
  const members = [
    { id: "a", name: "Ana" },
    { id: "b", name: "Beto" },
    { id: "c", name: "Cami" },
    { id: "d", name: "Dani" },
    { id: "e", name: "Eli" },
  ];

  it("deja solo a quienes confirmaron «Voy», en el orden de los miembros", () => {
    const attendees = [
      { userId: "d", status: "yes" },
      { userId: "a", status: "yes" },
      { userId: "b", status: "maybe" },
      { userId: "c", status: "no" },
    ];
    expect(confirmedMembers(members, attendees)).toEqual([
      { id: "a", name: "Ana" },
      { id: "d", name: "Dani" },
    ]);
  });

  it("quien no respondió no se puede asignar", () => {
    expect(confirmedMembers(members, [{ userId: "a", status: "yes" }])).toEqual([
      { id: "a", name: "Ana" },
    ]);
  });

  it("sin confirmados no queda nadie", () => {
    expect(confirmedMembers(members, [])).toEqual([]);
    expect(confirmedMembers(members, [{ userId: "a", status: "maybe" }])).toEqual([]);
  });

  it("ignora a quien confirmó pero no es miembro (ya no está en la lista)", () => {
    expect(confirmedMembers(members, [{ userId: "zzz", status: "yes" }])).toEqual([]);
  });

  it("devuelve los mismos objetos, sin copiarlos", () => {
    const [first] = confirmedMembers(members, [{ userId: "a", status: "yes" }]);
    expect(first).toBe(members[0]);
  });
});

describe("groupByPerson", () => {
  it("agrupa por persona en el orden en que aparece cada una, y deja sus filas en orden", () => {
    const rows = [
      { userId: "b", n: 1 },
      { userId: "a", n: 2 },
      { userId: "b", n: 3 },
      { userId: "c", n: 4 },
      { userId: "a", n: 5 },
    ];
    expect(groupByPerson(rows)).toEqual([
      { userId: "b", rows: [rows[0], rows[2]] },
      { userId: "a", rows: [rows[1], rows[4]] },
      { userId: "c", rows: [rows[3]] },
    ]);
  });

  it("sin filas no hay grupos", () => {
    expect(groupByPerson([])).toEqual([]);
  });
});

describe("itemWithQuantity", () => {
  it("pone la cantidad entre paréntesis si la hay", () => {
    expect(itemWithQuantity("Carne", "3 kg")).toBe("Carne (3 kg)");
  });

  it("sin cantidad queda solo el nombre", () => {
    expect(itemWithQuantity("Carne", null)).toBe("Carne");
    expect(itemWithQuantity("Carne", undefined)).toBe("Carne");
    expect(itemWithQuantity("Carne", "")).toBe("Carne");
  });

  it("el nombre siempre empieza con mayúscula", () => {
    expect(itemWithQuantity("servilletas", null)).toBe("Servilletas");
    expect(itemWithQuantity("hielo", "2 bolsas")).toBe("Hielo (2 bolsas)");
  });

  it("un insumo sin nombre dice «Insumo sin nombre»", () => {
    expect(itemWithQuantity(null, null)).toBe(UNNAMED_ITEM_LABEL);
    expect(itemWithQuantity("  ", "2 kg")).toBe(`${UNNAMED_ITEM_LABEL} (2 kg)`);
  });
});

describe("buildTasksShareText", () => {
  const base = {
    eventName: "Asado en lo de Javi",
    eventDateLabel: "sábado, 9 de noviembre, 21:00",
    eventUrl: "https://japa.example/eventos/abc",
  };

  const tasks: ShareTask[] = [
    {
      type: "compra_insumos",
      label: "Compra de insumos",
      rows: [
        { userId: "u1", userName: "Fercho", itemName: "Carne", quantity: "3 kg" },
        { userId: "u2", userName: "Mati", itemName: "servilletas", quantity: null },
        { userId: "u1", userName: "Fercho", itemName: "Hielo", quantity: "2 bolsas" },
      ],
    },
    {
      type: "lavado_platos",
      label: "Lavado de platos",
      rows: [
        { userId: "u3", userName: "Javi" },
        { userId: "u4", userName: "Bozzo" },
      ],
    },
    { type: "orden_sede", label: "Orden de la sede", rows: [] },
    {
      type: "reserva_cancha",
      label: "Reserva de cancha",
      rows: [{ userId: "u5", userName: "Nico" }],
    },
  ];

  it("arma el mensaje completo: insumos por persona con su cantidad, un renglón por persona en las demás y «Sin asignar»", () => {
    expect(buildTasksShareText({ ...base, tasks })).toBe(
      [
        "📋 *Tareas — Asado en lo de Javi*",
        "📅 sábado, 9 de noviembre, 21:00",
        "",
        "🛒 *Compra de insumos*",
        "• Fercho: Carne (3 kg), Hielo (2 bolsas)",
        "• Mati: Servilletas",
        "",
        "🧽 *Lavado de platos*",
        "• Javi",
        "• Bozzo",
        "",
        "🧹 *Orden de la sede*",
        "Sin asignar",
        "",
        "⚽ *Reserva de cancha*",
        "• Nico",
        "",
        "Más detalles: https://japa.example/eventos/abc",
      ].join("\n"),
    );
  });

  it("sin ninguna asignación no hay nada que compartir", () => {
    expect(
      buildTasksShareText({
        ...base,
        tasks: tasks.map((task) => ({ ...task, rows: [] })),
      }),
    ).toBeNull();
    expect(buildTasksShareText({ ...base, tasks: [] })).toBeNull();
  });

  it("alcanza con una sola asignación; el resto queda «Sin asignar»", () => {
    const text = buildTasksShareText({
      ...base,
      tasks: [
        { type: "compra_insumos", label: "Compra de insumos", rows: [] },
        { type: "lavado_platos", label: "Lavado de platos", rows: [{ userId: "u3", userName: "Javi" }] },
        { type: "orden_sede", label: "Orden de la sede", rows: [] },
      ],
    });
    expect(text).toBe(
      [
        "📋 *Tareas — Asado en lo de Javi*",
        "📅 sábado, 9 de noviembre, 21:00",
        "",
        "🛒 *Compra de insumos*",
        "Sin asignar",
        "",
        "🧽 *Lavado de platos*",
        "• Javi",
        "",
        "🧹 *Orden de la sede*",
        "Sin asignar",
        "",
        "Más detalles: https://japa.example/eventos/abc",
      ].join("\n"),
    );
  });

  it("la reserva de cancha solo sale si se la pasa (el evento tiene fútbol)", () => {
    const sinFutbol = buildTasksShareText({ ...base, tasks: tasks.slice(0, 3) });
    expect(sinFutbol).not.toContain("Reserva de cancha");
    expect(buildTasksShareText({ ...base, tasks })).toContain("⚽ *Reserva de cancha*");
  });

  it("un insumo sin nombre y uno sin cantidad se muestran sin romper el renglón", () => {
    const text = buildTasksShareText({
      ...base,
      tasks: [
        {
          type: "compra_insumos",
          label: "Compra de insumos",
          rows: [
            { userId: "u1", userName: "Fercho", itemName: null, quantity: "2 kg" },
            { userId: "u1", userName: "Fercho", itemName: "pan", quantity: "" },
          ],
        },
      ],
    });
    expect(text).toContain(`• Fercho: ${UNNAMED_ITEM_LABEL} (2 kg), Pan`);
  });

  it("una persona repetida en una tarea sin insumos sale una sola vez", () => {
    const text = buildTasksShareText({
      ...base,
      tasks: [
        {
          type: "lavado_platos",
          label: "Lavado de platos",
          rows: [
            { userId: "u3", userName: "Javi" },
            { userId: "u3", userName: "Javi" },
          ],
        },
      ],
    });
    expect(text?.split("\n").filter((line) => line === "• Javi")).toHaveLength(1);
  });

  it("el texto no cambia el nombre del evento ni la fecha que se le pasan", () => {
    const text = buildTasksShareText({
      ...base,
      eventName: "Cumple de *Pablo*",
      eventDateLabel: "viernes 14",
      tasks,
    });
    expect(text?.split("\n").slice(0, 2)).toEqual(["📋 *Tareas — Cumple de *Pablo**", "📅 viernes 14"]);
  });
});
