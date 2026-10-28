import { describe, expect, it } from "vitest";
import { buildEventSpending, itemStats } from "./spending";
import { expense, payment } from "./fixtures";

describe("itemStats", () => {
  it("sin gastos: cantidad 0 y el resto null (no 0)", () => {
    expect(itemStats([])).toEqual({ count: 0, mean: null, median: null, max: null });
  });

  it("mediana con cantidad impar y par", () => {
    expect(itemStats([30, 10, 20]).median).toBe(20);
    expect(itemStats([10, 20, 30, 40]).median).toBe(25);
  });

  it("un gasto enorme mueve el promedio pero no la mediana", () => {
    const stats = itemStats([10, 20, 30, 1000]);
    expect(stats.mean).toBe(265);
    expect(stats.median).toBe(25);
    expect(stats.max).toBe(1000);
  });

  it("redondea a centavos", () => {
    expect(itemStats([10, 10, 11]).mean).toBe(10.33);
  });
});

describe("buildEventSpending", () => {
  // a pone 100 y se divide entre a y b; b pone 60 y se divide entre a, b y c.
  const expenses = [
    expense("x1", "g1", "a", 100, ["a", "b"]),
    expense("x2", "g1", "b", 60, ["a", "b", "c"]),
  ];

  it("un evento sin gastos devuelve null (no un gasto de $0)", () => {
    expect(buildEventSpending([], [])).toBeNull();
    expect(buildEventSpending([], [payment("g1", "a", "b", 10)])).toBeNull();
  });

  it("total, ítems y costo por persona", () => {
    const s = buildEventSpending(expenses, [])!;
    expect(s.expenseCount).toBe(2);
    expect(s.total).toBe(160);
    expect(s.mean).toBe(80);
    expect(s.median).toBe(80);
    expect(s.max).toBe(100);
    expect(s.people).toBe(3);
    expect(s.costPerPerson).toBe(53.33);
  });

  it("mediana por persona: sobre lo que consumió cada una, no sobre lo que puso", () => {
    // consumos: a 50 + 20 = 70, b 50 + 20 = 70, c 20 → mediana 70
    expect(buildEventSpending(expenses, [])!.medianPerPerson).toBe(70);
  });

  it("aportes, consumo y neto por persona, del que más puso al que menos", () => {
    const s = buildEventSpending(expenses, [])!;
    expect(s.byMember).toEqual([
      { userId: "a", paid: 100, consumed: 70, net: 30, balance: 30 },
      { userId: "b", paid: 60, consumed: 70, net: -10, balance: -10 },
      { userId: "c", paid: 0, consumed: 20, net: -20, balance: -20 },
    ]);
  });

  it("concentración: cuántas personas pagaron y qué parte puso la que más puso", () => {
    const s = buildEventSpending(expenses, [])!;
    expect(s.payers).toBe(2);
    expect(s.topPayerId).toBe("a");
    expect(s.topPayerShare).toBe(0.625);
  });

  it("si una sola persona puso todo, su parte es 100 %", () => {
    const s = buildEventSpending([expense("x", "g1", "a", 90, ["a", "b", "c"])], [])!;
    expect(s.payers).toBe(1);
    expect(s.topPayerShare).toBe(1);
  });

  it("pendiente = lo que falta saldar (suma de saldos positivos)", () => {
    const s = buildEventSpending(expenses, [])!;
    expect(s.pending).toBe(30);
    expect(s.settled).toBe(false);
  });

  it("los pagos de deuda reportados bajan el pendiente y actualizan el saldo", () => {
    const s = buildEventSpending(expenses, [payment("g1", "c", "a", 20)])!;
    expect(s.pending).toBe(10);
    expect(s.byMember.find((m) => m.userId === "a")?.balance).toBe(10);
    expect(s.byMember.find((m) => m.userId === "c")?.balance).toBe(0);
    // el neto es lo que puso menos lo que consumió: un pago de deuda no lo toca
    expect(s.byMember.find((m) => m.userId === "c")?.net).toBe(-20);
  });

  it("con todo pagado el evento está saldado", () => {
    const s = buildEventSpending(expenses, [
      payment("g1", "b", "a", 10),
      payment("g1", "c", "a", 20),
    ])!;
    expect(s.pending).toBe(0);
    expect(s.settled).toBe(true);
  });

  it("un resto de centavos no cuenta como deuda", () => {
    const s = buildEventSpending(expenses, [
      payment("g1", "b", "a", 10),
      payment("g1", "c", "a", 19.6),
    ])!;
    expect(s.pending).toBe(0.4);
    expect(s.settled).toBe(true);
  });

  it("quien solo aparece en un pago no figura en los aportes", () => {
    const s = buildEventSpending(expenses, [payment("g1", "zz", "a", 5)])!;
    expect(s.byMember.map((m) => m.userId)).toEqual(["a", "b", "c"]);
  });

  it("partes desparejas: usa lo que le tocó a cada uno tal cual", () => {
    const s = buildEventSpending([expense("x", "g1", "a", 100, [["a", 70], ["b", 30]])], [])!;
    expect(s.costPerPerson).toBe(50);
    expect(s.medianPerPerson).toBe(50);
    expect(s.byMember).toEqual([
      { userId: "a", paid: 100, consumed: 70, net: 30, balance: 30 },
      { userId: "b", paid: 0, consumed: 30, net: -30, balance: -30 },
    ]);
  });

  it("quien pagó sin consumir nada (puso para los demás) aparece con consumo 0", () => {
    const s = buildEventSpending([expense("x", "g1", "z", 60, ["a", "b"])], [])!;
    expect(s.byMember[0]).toEqual({ userId: "z", paid: 60, consumed: 0, net: 60, balance: 60 });
    expect(s.people).toBe(2);
  });

  it("redondea a centavos sin ruido de punto flotante", () => {
    const s = buildEventSpending([expense("x", "g1", "a", 100, [["a", 33.34], ["b", 33.33], ["c", 33.33]])], [])!;
    expect(s.total).toBe(100);
    expect(s.costPerPerson).toBe(33.33);
    expect(s.byMember[0].net).toBe(66.66);
  });

  it("desempata a igual aporte por consumo y después por id (orden estable)", () => {
    const s = buildEventSpending(
      [
        expense("x1", "g1", "b", 10, ["a", "b"]),
        expense("x2", "g1", "a", 10, ["a", "b"]),
      ],
      [],
    )!;
    expect(s.byMember.map((m) => m.userId)).toEqual(["a", "b"]);
  });

  it("la mediana por ítem no se mueve por un gasto enorme", () => {
    const s = buildEventSpending(
      [
        expense("x1", "g1", "a", 10, ["a"]),
        expense("x2", "g1", "a", 20, ["a"]),
        expense("x3", "g1", "a", 30, ["a"]),
        expense("x4", "g1", "a", 1000, ["a"]),
      ],
      [],
    )!;
    expect(s.median).toBe(25);
    expect(s.mean).toBe(265);
  });

  it("un gasto sin partes no rompe: suma al total pero no a las personas", () => {
    const s = buildEventSpending([expense("x", "g1", "a", 50, [])], [])!;
    expect(s.total).toBe(50);
    expect(s.people).toBe(0);
    expect(s.costPerPerson).toBeNull();
    expect(s.medianPerPerson).toBeNull();
  });
});
