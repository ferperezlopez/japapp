import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularBalances, simplificarDeudas } from "@/lib/gastos/balances";
import { Card } from "@/components/ui/Card";
import { AddMemberForm } from "./AddMemberForm";
import { AddExpenseForm } from "@/components/gastos/AddExpenseForm";
import { DeleteExpenseButton } from "@/components/gastos/DeleteExpenseButton";

export default async function GroupPage({
  params,
}: PageProps<"/gastos/[groupId]">) {
  const { groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();

  if (!group) notFound();

  const { data: membershipRows } = await supabase
    .from("group_members")
    .select("user_id, profiles(id, name, email)")
    .eq("group_id", groupId);

  const members = (membershipRows ?? [])
    .map((row) => row.profiles)
    .filter((p): p is { id: string; name: string | null; email: string } => !!p);

  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ??
    members.find((m) => m.id === id)?.email ??
    "Desconocido";

  const { data: expenses } = await supabase
    .from("expenses")
    .select(
      "id, description, amount, expense_date, paid_by, created_by, expense_shares(user_id, share_amount)",
    )
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  const balances = calcularBalances(
    members.map((m) => m.id),
    (expenses ?? []).map((e) => ({
      paidBy: e.paid_by,
      shares: e.expense_shares.map((s) => ({
        userId: s.user_id,
        amount: Number(s.share_amount),
      })),
    })),
  );
  const settlements = simplificarDeudas(balances);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/gastos" className="text-sm text-foreground/50 hover:underline">
        ← Gastos
      </Link>
      <h1 className="mt-1 font-serif text-2xl text-foreground">
        {group.name}
      </h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-foreground/50">Balances</h2>
        <ul className="mt-2 space-y-1">
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
          <Card className="mt-4 bg-coral-soft/60 p-4 text-sm">
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
          </Card>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground/50">Miembros</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-full bg-surface px-3 py-1 text-xs text-foreground/80"
            >
              {m.name ?? m.email}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <AddMemberForm groupId={groupId} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground/50">Agregar gasto</h2>
        <div className="mt-2">
          <AddExpenseForm groupId={groupId} members={members} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground/50">Gastos</h2>
        <ul className="mt-2 divide-y divide-surface-border">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-foreground/50">
                  {e.expense_date} · pagó {memberName(e.paid_by)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium tabular-nums">
                  ${Number(e.amount).toFixed(2)}
                </span>
                {e.created_by === user?.id && (
                  <DeleteExpenseButton groupId={groupId} expenseId={e.id} />
                )}
              </div>
            </li>
          ))}
          {(expenses ?? []).length === 0 && (
            <p className="py-2 text-sm text-foreground/50">
              Todavía no hay gastos cargados.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
