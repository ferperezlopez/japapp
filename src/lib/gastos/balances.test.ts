import { describe, expect, it } from "vitest";
import { calcularBalances, simplificarDeudas } from "./balances";

describe("calcularBalances", () => {
  it("devuelve balance 0 para todos si no hay gastos", () => {
    const result = calcularBalances(["a", "b"], []);
    expect(result).toEqual([
      { userId: "a", balance: 0 },
      { userId: "b", balance: 0 },
    ]);
  });

  it("balancea a 0 si el pagador consume todo su propio gasto", () => {
    const result = calcularBalances(["a"], [
      { paidBy: "a", shares: [{ userId: "a", amount: 100 }] },
    ]);
    expect(result).toEqual([{ userId: "a", balance: 0 }]);
  });

  it("split parejo entre dos miembros", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 50 },
            { userId: "b", amount: 50 },
          ],
        },
      ],
    );
    expect(result).toEqual([
      { userId: "a", balance: 50 },
      { userId: "b", balance: -50 },
    ]);
  });

  it("split disparejo: usa las shares tal cual, sin asumir un total parejo", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 20 },
            { userId: "b", amount: 80 },
          ],
        },
      ],
    );
    expect(result).toEqual([
      { userId: "a", balance: 80 },
      { userId: "b", balance: -80 },
    ]);
  });

  it("un paidBy fuera de memberIds se trackea pero no aparece en el resultado", () => {
    const result = calcularBalances(
      ["a"],
      [
        {
          paidBy: "outsider",
          shares: [{ userId: "a", amount: 30 }],
        },
      ],
    );
    // "outsider" no está en memberIds, así que solo vemos el lado deudor de "a".
    expect(result).toEqual([{ userId: "a", balance: -30 }]);
  });

  it("una share de un userId fuera de memberIds se trackea pero no aparece", () => {
    const result = calcularBalances(
      ["a"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 10 },
            { userId: "outsider", amount: 90 },
          ],
        },
      ],
    );
    expect(result).toEqual([{ userId: "a", balance: 90 }]);
  });

  it("redondea a 2 decimales", () => {
    const result = calcularBalances(
      ["a", "b", "c"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 3.333333 },
            { userId: "b", amount: 3.333333 },
            { userId: "c", amount: 3.333333 },
          ],
        },
      ],
    );
    expect(result.find((b) => b.userId === "a")?.balance).toBeCloseTo(6.67, 2);
    expect(result.find((b) => b.userId === "b")?.balance).toBe(-3.33);
    expect(result.find((b) => b.userId === "c")?.balance).toBe(-3.33);
  });

  it("múltiples gastos que se cancelan netean a 0", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 50 },
            { userId: "b", amount: 50 },
          ],
        },
        {
          paidBy: "b",
          shares: [
            { userId: "a", amount: 50 },
            { userId: "b", amount: 50 },
          ],
        },
      ],
    );
    expect(result).toEqual([
      { userId: "a", balance: 0 },
      { userId: "b", balance: 0 },
    ]);
  });

  it("un pago reportado reduce la deuda del pagador y lo recibido por el acreedor", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 50 },
            { userId: "b", amount: 50 },
          ],
        },
      ],
      [{ from: "b", to: "a", amount: 30 }],
    );
    expect(result).toEqual([
      { userId: "a", balance: 20 },
      { userId: "b", balance: -20 },
    ]);
  });

  it("un pago que salda toda la deuda deja el balance en 0", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: 50 },
            { userId: "b", amount: 50 },
          ],
        },
      ],
      [{ from: "b", to: "a", amount: 50 }],
    );
    expect(result).toEqual([
      { userId: "a", balance: 0 },
      { userId: "b", balance: 0 },
    ]);
  });

  it("acepta montos negativos (ej. un reembolso) sin rechazarlos", () => {
    const result = calcularBalances(
      ["a", "b"],
      [
        {
          paidBy: "a",
          shares: [
            { userId: "a", amount: -10 },
            { userId: "b", amount: 10 },
          ],
        },
      ],
    );
    // totalPaid = -10 + 10 = 0, así que "a" solo se ve afectado por su
    // propia share negativa (0 - (-10) = 10); "b" resta su share normal.
    expect(result).toEqual([
      { userId: "a", balance: 10 },
      { userId: "b", balance: -10 },
    ]);
  });
});

describe("simplificarDeudas", () => {
  it("no genera settlements si todos los balances están en 0", () => {
    expect(simplificarDeudas([{ userId: "a", balance: 0 }])).toEqual([]);
  });

  it("un deudor y un acreedor exactos generan un único settlement", () => {
    const result = simplificarDeudas([
      { userId: "a", balance: 50 },
      { userId: "b", balance: -50 },
    ]);
    expect(result).toEqual([{ from: "b", to: "a", amount: 50 }]);
  });

  it("excluye balances dentro del umbral de ±0.01", () => {
    const result = simplificarDeudas([
      { userId: "a", balance: 0.005 },
      { userId: "b", balance: -0.005 },
    ]);
    expect(result).toEqual([]);
  });

  it("excluye un balance de exactamente -0.01 (umbral estricto, no Math.abs)", () => {
    const result = simplificarDeudas([
      { userId: "a", balance: 0.01 },
      { userId: "b", balance: -0.01 },
    ]);
    expect(result).toEqual([]);
  });

  it("sin contraparte (solo deudores o solo acreedores) no genera settlements", () => {
    expect(
      simplificarDeudas([
        { userId: "a", balance: -50 },
        { userId: "b", balance: -20 },
      ]),
    ).toEqual([]);
    expect(
      simplificarDeudas([
        { userId: "a", balance: 50 },
        { userId: "b", balance: 20 },
      ]),
    ).toEqual([]);
  });

  it("un deudor grande dividido entre dos acreedores más chicos", () => {
    const result = simplificarDeudas([
      { userId: "a", balance: 30 },
      { userId: "b", balance: 20 },
      { userId: "c", balance: -50 },
    ]);
    expect(result).toEqual([
      { from: "c", to: "a", amount: 30 },
      { from: "c", to: "b", amount: 20 },
    ]);
  });

  it("múltiples deudores y acreedores: cada uno salda su total exacto", () => {
    const balances = [
      { userId: "a", balance: 40 },
      { userId: "b", balance: 25 },
      { userId: "c", balance: -30 },
      { userId: "d", balance: -35 },
    ];
    const result = simplificarDeudas(balances);

    const outgoingByDebtor = new Map<string, number>();
    const incomingByCreditor = new Map<string, number>();
    for (const s of result) {
      outgoingByDebtor.set(s.from, (outgoingByDebtor.get(s.from) ?? 0) + s.amount);
      incomingByCreditor.set(s.to, (incomingByCreditor.get(s.to) ?? 0) + s.amount);
    }

    expect(outgoingByDebtor.get("c")).toBeCloseTo(30, 2);
    expect(outgoingByDebtor.get("d")).toBeCloseTo(35, 2);
    expect(incomingByCreditor.get("a")).toBeCloseTo(40, 2);
    expect(incomingByCreditor.get("b")).toBeCloseTo(25, 2);
  });
});
