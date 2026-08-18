import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularBalances, simplificarDeudas } from "@/lib/gastos/balances";
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
      <Link href="/gastos" className="text-sm text-zinc-500 hover:underline">
        ← Gastos
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {group.name}
      </h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Balances</h2>
        <ul className="mt-2 space-y-1">
          {balances.map((b) => (
            <li key={b.userId} className="flex justify-between text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {memberName(b.userId)}
              </span>
              <span
                className={`font-medium tabular-nums ${
                  b.balance > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : b.balance < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500"
                }`}
              >
                {b.balance > 0 ? "+" : ""}
                {b.balance.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>

        {settlements.length > 0 && (
          <div className="mt-4 rounded-xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-semibold">Para saldar cuentas</h3>
            <ul className="mt-2 space-y-1 text-zinc-700 dark:text-zinc-300">
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
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Miembros</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
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
        <h2 className="text-sm font-semibold">Agregar gasto</h2>
        <div className="mt-2">
          <AddExpenseForm groupId={groupId} members={members} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Gastos</h2>
        <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-zinc-500">
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
            <p className="py-2 text-sm text-zinc-500">
              Todavía no hay gastos cargados.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
