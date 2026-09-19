export interface ExpenseForBalance {
  paidBy: string;
  shares: { userId: string; amount: number }[];
}

export interface PaymentForBalance {
  from: string;
  to: string;
  amount: number;
}

export interface Balance {
  userId: string;
  balance: number; // positivo: le deben plata. negativo: debe plata.
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

// `payments`: pagos ya reportados entre dos personas (debt_payments,
// specs/002-gastos.md) — a diferencia de un gasto, acá nadie "consume"
// nada, es plata que cambió de mano para saldar una deuda ya calculada.
// Mismo efecto en el balance que un gasto de un solo participante:
// quien paga suma a su balance (debe menos), quien recibe resta (le
// deben menos).
export function calcularBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
  payments: PaymentForBalance[] = [],
): Balance[] {
  const balanceByUser = new Map<string, number>(
    memberIds.map((id) => [id, 0]),
  );

  for (const expense of expenses) {
    const totalPaid = expense.shares.reduce((sum, s) => sum + s.amount, 0);
    balanceByUser.set(
      expense.paidBy,
      (balanceByUser.get(expense.paidBy) ?? 0) + totalPaid,
    );
    for (const share of expense.shares) {
      balanceByUser.set(
        share.userId,
        (balanceByUser.get(share.userId) ?? 0) - share.amount,
      );
    }
  }

  for (const payment of payments) {
    balanceByUser.set(
      payment.from,
      (balanceByUser.get(payment.from) ?? 0) + payment.amount,
    );
    balanceByUser.set(
      payment.to,
      (balanceByUser.get(payment.to) ?? 0) - payment.amount,
    );
  }

  return memberIds.map((userId) => ({
    userId,
    balance: roundTo(balanceByUser.get(userId) ?? 0, 2),
  }));
}

// Algoritmo goloso de simplificacion de deudas: en cada paso, el que mas
// debe le paga al que mas le deben, hasta saldar todo con el minimo de
// transferencias posible.
export function simplificarDeudas(balances: Balance[]): Settlement[] {
  const deudores = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ userId: b.userId, amount: -b.balance }))
    .sort((a, b) => b.amount - a.amount);

  const acreedores = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ userId: b.userId, amount: b.balance }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < deudores.length && j < acreedores.length) {
    const deudor = deudores[i];
    const acreedor = acreedores[j];
    const amount = roundTo(Math.min(deudor.amount, acreedor.amount), 2);

    if (amount > 0.01) {
      settlements.push({ from: deudor.userId, to: acreedor.userId, amount });
    }

    deudor.amount = roundTo(deudor.amount - amount, 2);
    acreedor.amount = roundTo(acreedor.amount - amount, 2);

    if (deudor.amount <= 0.01) i++;
    if (acreedor.amount <= 0.01) j++;
  }

  return settlements;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
