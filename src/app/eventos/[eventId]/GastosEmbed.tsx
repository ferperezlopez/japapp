import Link from "next/link";
import { AddExpenseForm } from "@/components/gastos/AddExpenseForm";
import { DeleteExpenseButton } from "@/components/gastos/DeleteExpenseButton";
import type { Balance, Settlement } from "@/lib/gastos/balances";

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  paid_by: string;
  created_by: string;
}

export function GastosEmbed({
  groupId,
  members,
  expenses,
  balances,
  settlements,
  currentUserId,
  canAddExpense,
}: {
  groupId: string;
  members: Member[];
  expenses: Expense[];
  balances: Balance[];
  settlements: Settlement[];
  currentUserId: string | undefined;
  canAddExpense: boolean;
}) {
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ??
    members.find((m) => m.id === id)?.email ??
    "Desconocido";

  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        {balances.map((b) => (
          <li
            key={b.userId}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-foreground/80">
              {memberName(b.userId)}
            </span>
            {b.balance > 0 ? (
              <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-medium text-teal-ink">
                +${b.balance.toFixed(2)}
              </span>
            ) : b.balance < 0 ? (
              <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-medium text-amber-ink">
                ${b.balance.toFixed(2)}
              </span>
            ) : (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground/50">
                $0.00
              </span>
            )}
          </li>
        ))}
      </ul>

      {settlements.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-coral-soft/60 p-4 text-sm">
          <h3 className="font-medium text-coral-ink dark:text-coral-mid">
            Para saldar cuentas
          </h3>
          <ul className="mt-2 space-y-1 text-foreground/80">
            {settlements.map((s, i) => (
              <li key={i}>
                {memberName(s.from)} le paga{" "}
                <span className="font-medium tabular-nums">
                  ${s.amount.toFixed(2)}
                </span>{" "}
                a {memberName(s.to)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-surface-border">
        {expenses.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between py-2 text-sm"
          >
            <div>
              <p className="font-medium">{e.description}</p>
              <p className="text-xs text-foreground/50">
                {e.expense_date} · pagó {memberName(e.paid_by)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium tabular-nums">
                ${e.amount.toFixed(2)}
              </span>
              {e.created_by === currentUserId && (
                <DeleteExpenseButton groupId={groupId} expenseId={e.id} />
              )}
            </div>
          </li>
        ))}
        {expenses.length === 0 && (
          <p className="py-2 text-sm text-foreground/50">
            Todavía no hay gastos cargados.
          </p>
        )}
      </ul>

      {canAddExpense ? (
        <AddExpenseForm groupId={groupId} members={members} />
      ) : (
        <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-foreground/50">
          Confirmá &quot;Voy&quot; para poder cargar gastos de esta juntada.
        </p>
      )}

      <Link
        href={`/gastos/${groupId}`}
        className="inline-block text-xs text-foreground/50 hover:underline"
      >
        Ver este grupo en Gastos →
      </Link>
    </div>
  );
}
