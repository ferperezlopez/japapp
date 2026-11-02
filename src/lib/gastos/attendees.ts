// Quiénes aparecen en «Balances» de un grupo de gastos.
//
// Con un evento enlazado, «asistió» es quien confirmó «Voy» a la juntada: lo
// mismo que ya ofrecen «Pagó» y «Se divide entre» y lo mismo que cuenta
// Analytics (src/lib/analytics/attendance.ts). Antes Balances usaba a todos
// los miembros del grupo, y un grupo conserva a quien dijo «Voy» y después
// cambió de idea (el trigger que lo suma no lo saca) o a quien se agregó a mano:
// aparecían en $0 gente que no fue.
//
// La plata nunca se esconde: quien pagó, tiene una parte de un gasto o hizo o
// recibió un pago figura siempre, haya confirmado o no. Sin eso,
// calcularBalances perdería en silencio esa plata (solo devuelve balance para
// los ids que se le pasan). Ver specs/002-gastos.md.
//
// Un grupo suelto (sin evento) no tiene «confirmados» de qué hablar: se
// mantiene el criterio de siempre, los miembros del grupo.
export interface BalanceUniverseInput {
  /** El grupo está enlazado a un evento. */
  linkedToEvent: boolean;
  /** Quienes confirmaron «Voy» a la juntada (solo se mira con evento enlazado). */
  confirmedIds: Iterable<string>;
  /** Miembros del grupo (solo se mira en un grupo suelto). */
  memberIds: Iterable<string>;
  expenses: { paidBy: string; shares: { userId: string }[] }[];
  payments: { from: string; to: string }[];
}

export function balanceUniverse({
  linkedToEvent,
  confirmedIds,
  memberIds,
  expenses,
  payments,
}: BalanceUniverseInput): Set<string> {
  const ids = new Set<string>(linkedToEvent ? confirmedIds : memberIds);
  for (const expense of expenses) {
    ids.add(expense.paidBy);
    for (const share of expense.shares) ids.add(share.userId);
  }
  for (const payment of payments) {
    ids.add(payment.from);
    ids.add(payment.to);
  }
  return ids;
}
