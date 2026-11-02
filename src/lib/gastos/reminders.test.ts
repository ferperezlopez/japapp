import { describe, expect, it } from "vitest";
import type { ExpenseForBalance, PaymentForBalance } from "./balances";
import { debtorsToRemind } from "./reminders";

const expense = (paidBy: string, shares: Record<string, number>): ExpenseForBalance => ({
  paidBy,
  shares: Object.entries(shares).map(([userId, amount]) => ({ userId, amount })),
});

const payment = (from: string, to: string, amount: number): PaymentForBalance => ({
  from,
  to,
  amount,
});

// «a» pagó 100 y se divide a medias con «b».
const SPLIT = [expense("a", { a: 50, b: 50 })];

// El orden de los avisados no es parte del contrato: se compara ordenado.
function remind(input: {
  expenses?: ExpenseForBalance[];
  payments?: PaymentForBalance[];
  alreadyNotifiedIds?: Iterable<string>;
}) {
  return debtorsToRemind({
    expenses: input.expenses ?? SPLIT,
    payments: input.payments ?? [],
    alreadyNotifiedIds: input.alreadyNotifiedIds ?? [],
  }).sort();
}

describe("debtorsToRemind", () => {
  it("avisa a quien debe según los gastos y no a quien le deben", () => {
    expect(remind({})).toEqual(["b"]);
  });

  it("no avisa a quien ya informó el pago de toda su deuda", () => {
    expect(remind({ payments: [payment("b", "a", 50)] })).toEqual([]);
  });

  it("el aviso de más del 1/11: Fercho había informado su pago a Mati C y el resto sigue debiendo", () => {
    const expenses = [
      expense("matiC", { matiC: 10, fercho: 42740.5, ari: 42740.5, nico: 22557.12, tato: 6540.43 }),
    ];

    // Sin el pago, Fercho figura entre quienes deben (lo que hacía el cron).
    expect(remind({ expenses })).toEqual(["ari", "fercho", "nico", "tato"]);
    // Con el pago informado, ya no.
    expect(remind({ expenses, payments: [payment("fercho", "matiC", 42740.5)] })).toEqual([
      "ari",
      "nico",
      "tato",
    ]);
  });

  it("un pago parcial deja lo que falta y sigue avisando", () => {
    expect(remind({ payments: [payment("b", "a", 30)] })).toEqual(["b"]);
  });

  it("varios pagos chicos que suman la deuda la saldan", () => {
    expect(
      remind({ payments: [payment("b", "a", 20), payment("b", "a", 20), payment("b", "a", 10)] }),
    ).toEqual([]);
  });

  it("un evento saldado por los pagos no le avisa a nadie", () => {
    const expenses = [expense("a", { a: 10, b: 30, c: 60 })];
    expect(
      remind({ expenses, payments: [payment("b", "a", 30), payment("c", "a", 60)] }),
    ).toEqual([]);
  });

  it("deber un centavo (el umbral estricto de «Para saldar cuentas») no se avisa; dos, sí", () => {
    const owing = (bShare: number) =>
      remind({ expenses: [expense("a", { a: 50, b: bShare })], payments: [payment("b", "a", 50)] });
    expect(owing(50.01)).toEqual([]); // quedan 0,01
    expect(owing(50.02)).toEqual(["b"]); // quedan 0,02
  });

  it("no repite el aviso a quien ya lo recibió de ese evento", () => {
    const expenses = [expense("a", { a: 10, b: 45, c: 45 })];
    expect(remind({ expenses, alreadyNotifiedIds: ["b"] })).toEqual(["c"]);
    expect(remind({ expenses, alreadyNotifiedIds: ["b", "c"] })).toEqual([]);
  });

  it("acepta cualquier iterable de ids ya avisados (Set), no solo arrays", () => {
    expect(remind({ alreadyNotifiedIds: new Set<string>() })).toEqual(["b"]);
    expect(remind({ alreadyNotifiedIds: new Set(["b"]) })).toEqual([]);
  });

  it("no hace falta ser miembro del grupo: quien se salió debiendo recibe el aviso hasta que informe su pago", () => {
    // «gone» ya no figura entre los miembros, pero tiene una parte del gasto.
    const expenses = [expense("a", { a: 50, gone: 50 })];
    expect(remind({ expenses })).toEqual(["gone"]);
    expect(remind({ expenses, payments: [payment("gone", "a", 50)] })).toEqual([]);
  });

  it("un pago hacia alguien sin gastos propios también cuenta (mismo universo que la pantalla)", () => {
    // Quien recibe un pago resta de su balance: sin gastos que lo compensen, queda debiendo.
    expect(remind({ expenses: [], payments: [payment("x", "y", 10)] })).toEqual(["y"]);
  });

  it("sin gastos ni pagos no hay a quién avisar", () => {
    expect(remind({ expenses: [], payments: [] })).toEqual([]);
  });

  it("quien pagó más de lo que consumió (acreedor) no recibe aviso; quien pagó menos, sí", () => {
    // «a» pagó 30 y consumió 20; «b» pagó 70 y consumió 80: «b» debe 10 y a «a» le deben 10.
    const expenses = [expense("a", { a: 10, b: 20 }), expense("b", { a: 10, b: 60 })];
    expect(remind({ expenses })).toEqual(["b"]);
  });
});
