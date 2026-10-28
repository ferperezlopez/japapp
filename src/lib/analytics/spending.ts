// Gastos y aportes de un evento para Analytics (spec 021), sobre los gastos del
// grupo del evento. Los saldos pendientes salen de `calcularBalances` (el mismo
// cálculo de /gastos/[groupId]), así que acá y allá los números coinciden.

import { calcularBalances } from "@/lib/gastos/balances";
import { fraction, mean, median, roundTo, sum } from "./stats";
import type { EventSpending, ExpenseRow, MemberMoney, PaymentRow } from "./types";

// Por debajo de esto el evento se considera saldado: los montos se muestran en
// pesos enteros, así que un resto de centavos no es una deuda para nadie.
const SETTLED_BELOW = 1;
// Mismo umbral por persona que `simplificarDeudas`.
const BALANCE_EPSILON = 0.01;

export interface ItemStats {
  count: number;
  mean: number | null;
  median: number | null;
  max: number | null;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : roundTo(value);
}

// Cada gasto cargado es un «ítem»: la mediana dice cuánto cuesta un gasto
// típico sin que la carne de un día la mueva.
export function itemStats(amounts: readonly number[]): ItemStats {
  return {
    count: amounts.length,
    mean: roundOrNull(mean(amounts)),
    median: roundOrNull(median(amounts)),
    max: amounts.length > 0 ? Math.max(...amounts) : null,
  };
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

// Devuelve null si el evento no tiene gastos: «sin gastos» no es «gastó $0»
// (no entra en promedios ni comparativas).
export function buildEventSpending(
  expenses: readonly ExpenseRow[],
  payments: readonly PaymentRow[],
): EventSpending | null {
  if (expenses.length === 0) return null;

  const amounts = expenses.map((e) => e.amount);
  const total = roundTo(sum(amounts));
  const items = itemStats(amounts);

  const paid = new Map<string, number>();
  const consumed = new Map<string, number>();
  for (const e of expenses) {
    add(paid, e.paidBy, e.amount);
    for (const s of e.shares) add(consumed, s.userId, s.amount);
  }

  // Saldos: como en /gastos, entran también quienes solo aparecen en un pago.
  const involved = new Set<string>([...paid.keys(), ...consumed.keys()]);
  for (const p of payments) {
    involved.add(p.from);
    involved.add(p.to);
  }
  const balances = new Map(
    calcularBalances([...involved], [...expenses], [...payments]).map((b) => [b.userId, b.balance]),
  );

  const byMember: MemberMoney[] = [...new Set([...paid.keys(), ...consumed.keys()])]
    .map((userId) => {
      const put = paid.get(userId) ?? 0;
      const took = consumed.get(userId) ?? 0;
      return {
        userId,
        paid: roundTo(put),
        consumed: roundTo(took),
        net: roundTo(put - took),
        balance: balances.get(userId) ?? 0,
      };
    })
    .sort((a, b) => b.paid - a.paid || b.consumed - a.consumed || a.userId.localeCompare(b.userId));

  const people = consumed.size;
  const top = byMember.find((m) => m.paid > 0) ?? null;
  const pending = roundTo(
    sum([...balances.values()].filter((balance) => balance > BALANCE_EPSILON)),
  );

  return {
    expenseCount: expenses.length,
    total,
    // No vacío: se descartó arriba, así que mean/median/max siempre existen.
    mean: items.mean ?? 0,
    median: items.median ?? 0,
    max: items.max ?? 0,
    people,
    costPerPerson: people > 0 ? roundTo(total / people) : null,
    medianPerPerson: roundOrNull(median([...consumed.values()])),
    payers: paid.size,
    topPayerId: top?.userId ?? null,
    topPayerShare: top ? fraction(top.paid, total) : null,
    pending,
    settled: pending < SETTLED_BELOW,
    byMember,
  };
}
