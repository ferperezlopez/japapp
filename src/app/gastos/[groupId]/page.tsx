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

  const [{ data: membershipRows }, { data: allProfiles }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, profiles(id, name, email)")
      .eq("group_id", groupId),
    supabase.from("profiles").select("id, name, email, alias").order("name"),
  ]);

  const members = (membershipRows ?? [])
    .map((row) => row.profiles)
    .filter((p): p is { id: string; name: string | null; email: string } => !!p);

  const profiles = allProfiles ?? [];

  const memberName = (id: string) =>
    profiles.find((p) => p.id === id)?.name ??
    profiles.find((p) => p.id === id)?.email ??
    "Desconocido";

  const memberAlias = (id: string) => profiles.find((p) => p.id === id)?.alias;

  const { data: expenses } = await supabase
    .from("expenses")
    .select(
      "id, description, amount, expense_date, paid_by, created_by, expense_shares(user_id, share_amount)",
    )
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  // El universo de balances es "miembros formales" + cualquiera que ya
  // aparezca pagando o participando de un gasto de este grupo — desde que
  // el selector de "pagó"/"participantes" en AddExpenseForm dejó de estar
  // limitado a los miembros formales (ver specs/002-gastos.md), alguien
  // puede aparecer en un gasto sin ser "miembro". Sin esto, calcularBalances
  // perdería silenciosamente esa plata (solo devuelve balance para los ids
  // que se le pasan).
  const relevantIds = new Set(members.map((m) => m.id));
  for (const e of expenses ?? []) {
    relevantIds.add(e.paid_by);
    for (const s of e.expense_shares) relevantIds.add(s.user_id);
  }
  const balanceMemberIds = profiles
    .filter((p) => relevantIds.has(p.id))
    .map((p) => p.id);

  const balances = calcularBalances(
    balanceMemberIds,
    (expenses ?? []).map((e) => ({
      paidBy: e.paid_by,
      shares: e.expense_shares.map((s) => ({
        userId: s.user_id,
        amount: Number(s.share_amount),
      })),
    })),
  );
  const settlements = simplificarDeudas(balances);

  // Igual que antes en el evento (ver specs/004-eventos-gastos-y-fotos.md):
  // cargar un gasto requiere ser miembro real del grupo. Para un grupo
  // enlazado a un evento, "miembro" ya incluye tanto al creador como a
  // quien confirmó "Voy" (los suma el trigger on_rsvp_upsert), así que no
  // hace falta ninguna otra condición acá.
  const canAddExpense = !!user && members.some((m) => m.id === user.id);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/gastos" className="text-sm text-foreground/50 hover:underline">
        ← Gastos
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
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
                <span className="rounded-full bg-eventos-soft px-2.5 py-0.5 text-xs font-medium text-eventos-ink">
                  +${b.balance.toFixed(2)}
                </span>
              ) : b.balance < 0 ? (
                <span className="rounded-full bg-gastos-soft px-2.5 py-0.5 text-xs font-medium text-gastos-ink">
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
          <Card className="mt-4 bg-gastos-soft/60 p-4 text-sm">
            <h3 className="font-medium text-gastos-ink dark:text-gastos-mid">
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
                  {memberAlias(s.to) && (
                    <span className="text-foreground/50">
                      {" "}
                      (alias: {memberAlias(s.to)})
                    </span>
                  )}
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
          {canAddExpense ? (
            <AddExpenseForm
              groupId={groupId}
              people={profiles}
              defaultParticipantIds={members.map((m) => m.id)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-foreground/50">
              Necesitás ser parte de este grupo para cargar un gasto.
            </p>
          )}
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
