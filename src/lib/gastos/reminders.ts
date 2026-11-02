import { balanceUniverse } from "./attendees";
import { calcularBalances, type ExpenseForBalance, type PaymentForBalance } from "./balances";

// A quién le avisa el recordatorio automático de saldo pendiente
// (/api/cron/balance-reminders, caso 7 de specs/017-push-notifications.md).
//
// «Todavía debe» es lo mismo que muestra «Para saldar cuentas» en
// /gastos/[groupId]: el balance de cada persona después de los gastos Y de los
// pagos informados (debt_payments, specs/002-gastos.md). El cron los dejaba
// afuera y le avisaba a quien ya había pagado y lo había informado.
//
// No hace falta saber quiénes son los miembros del grupo: deber plata supone
// tener plata en juego (una parte de un gasto o haber recibido un pago) y quien
// no tiene nada tiene balance 0. Así también se avisa a quien se salió del grupo
// debiendo (los gastos de un grupo de evento los ve cualquiera, así que puede
// abrir el link del aviso), igual que lo cuenta la pantalla.
export interface RemindersInput {
  expenses: ExpenseForBalance[];
  /** Los pagos informados del grupo: sin ellos se avisa a quien ya pagó. */
  payments: PaymentForBalance[];
  /** Quienes ya recibieron el aviso de este evento (balance_reminders_sent). */
  alreadyNotifiedIds: Iterable<string>;
}

/**
 * Quienes todavía deben plata, después de los pagos informados, y no recibieron
 * ya el aviso de este evento. Debe plata quien tiene un balance menor a -0,01:
 * el mismo umbral estricto que usa `simplificarDeudas` para «Para saldar cuentas».
 */
export function debtorsToRemind({
  expenses,
  payments,
  alreadyNotifiedIds,
}: RemindersInput): string[] {
  const notified = new Set(alreadyNotifiedIds);
  // Sin miembros ni confirmados: solo quien tiene plata en juego (pagó, tiene una
  // parte de un gasto o hizo/recibió un pago), que es de donde salen los deudores.
  const involved = balanceUniverse({
    linkedToEvent: false,
    confirmedIds: [],
    memberIds: [],
    expenses,
    payments,
  });

  return calcularBalances([...involved], expenses, payments)
    .filter((balance) => balance.balance < -0.01 && !notified.has(balance.userId))
    .map((balance) => balance.userId);
}
