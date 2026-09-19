import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularBalances, simplificarDeudas } from "@/lib/gastos/balances";
import { resolveIcon } from "@/lib/eventos/insumos";
import { abbreviateName } from "@/lib/formatName";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CopyableText } from "@/components/ui/CopyableText";
import { AddMemberForm } from "./AddMemberForm";
import { AddExpenseForm } from "@/components/gastos/AddExpenseForm";
import { DeleteExpenseButton } from "@/components/gastos/DeleteExpenseButton";
import { ExpenseIconEditor } from "@/components/gastos/ExpenseIconEditor";
import { ReportPaymentButton } from "@/components/gastos/ReportPaymentButton";
import { DeleteDebtPaymentButton } from "@/components/gastos/DeleteDebtPaymentButton";

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

  // Si este grupo está enlazado a un evento (ver
  // specs/004-eventos-gastos-y-fotos.md), "pagó"/"se divide entre" debe
  // restringirse a quien confirmó "Voy" al evento (kind "juntada"), no a
  // cualquier profile de la app — pedido explícito del usuario,
  // revirtiendo el criterio de "cualquiera" de 2026-09-15. El creador del
  // evento NO queda incluido automáticamente: también necesita su propio
  // RSVP status="yes" para ser elegible.
  const { data: linkedEvent } = await supabase
    .from("events")
    .select("id")
    .eq("group_id", groupId)
    .maybeSingle();

  const [
    { data: membershipRows },
    { data: allProfiles },
    { data: rsvpRows },
    { data: insumoItems },
    { data: me },
  ] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, profiles(id, name, email, avatar_url)")
      .eq("group_id", groupId),
    supabase
      .from("profiles")
      .select("id, name, email, alias, avatar_url")
      .order("name"),
    linkedEvent
      ? supabase
          .from("event_rsvps")
          .select("user_id, status")
          .eq("event_id", linkedEvent.id)
          .eq("kind", "juntada")
      : Promise.resolve({ data: null }),
    supabase.from("insumo_items").select("id, name, icon").order("name"),
    user
      ? supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const isAdmin = me?.is_admin ?? false;

  const members = (membershipRows ?? [])
    .map((row) => row.profiles)
    .filter(
      (
        p,
      ): p is {
        id: string;
        name: string | null;
        email: string;
        avatar_url: string | null;
      } => !!p,
    );

  const profiles = allProfiles ?? [];

  // Grupo standalone (sin evento enlazado): no hay "confirmados" de qué
  // hablar, se mantiene el criterio de "cualquier persona de la app" para
  // pagó/participantes. Si hay evento, se restringe a quien confirmó "Voy"
  // a la juntada (status='yes', kind='juntada').
  const confirmedIds = new Set(
    (rsvpRows ?? []).filter((r) => r.status === "yes").map((r) => r.user_id),
  );
  const payerOptions = linkedEvent
    ? profiles.filter((p) => confirmedIds.has(p.id))
    : profiles;
  const expenseParticipantDefaults = linkedEvent
    ? payerOptions.map((p) => p.id)
    : members.map((m) => m.id);

  const memberName = (id: string) =>
    profiles.find((p) => p.id === id)?.name ??
    profiles.find((p) => p.id === id)?.email ??
    "Desconocido";

  const memberAlias = (id: string) => profiles.find((p) => p.id === id)?.alias;

  const memberAvatar = (id: string) =>
    profiles.find((p) => p.id === id)?.avatar_url ?? null;

  // Si el gasto está ligado a un ítem del catálogo (item_id), el emoji
  // sale de ahí (resolveIcon, compartido con "compra de insumos"). Si
  // no, cae a expenses.icon (0034) — a diferencia de "compra de
  // insumos", una descripción en texto libre no pasa por matching de
  // palabra clave (ver specs/002-gastos.md): sería raro que "Cuota
  // cancha marzo" saque un emoji por casualidad, así que sin un icon
  // explícito no se muestra nada.
  const expenseIcon = (e: { item_id: string | null; icon: string | null }) => {
    const item = e.item_id ? insumoItems?.find((i) => i.id === e.item_id) : null;
    return item ? resolveIcon(item) : e.icon;
  };

  const { data: expenses } = await supabase
    .from("expenses")
    .select(
      "id, description, item_id, icon, amount, expense_date, paid_by, created_by, expense_shares(user_id, share_amount)",
    )
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Pagos ya reportados (0035, "informe de pago realizado") — se restan
  // directo en calcularBalances, así que "para saldar cuentas" se achica
  // sola sin tocar los gastos originales.
  const { data: debtPayments } = await supabase
    .from("debt_payments")
    .select("id, from_user_id, to_user_id, amount, reported_by, created_at")
    .eq("group_id", groupId)
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
  for (const p of debtPayments ?? []) {
    relevantIds.add(p.from_user_id);
    relevantIds.add(p.to_user_id);
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
    (debtPayments ?? []).map((p) => ({
      from: p.from_user_id,
      to: p.to_user_id,
      amount: Number(p.amount),
    })),
  );
  const settlements = simplificarDeudas(balances);

  // Quién puede *cargar* un gasto (member real, group_members histórico) es
  // un concepto distinto de qué opciones ofrece el selector de "pagó"/"se
  // divide entre" (payerOptions, arriba, basado en confirmación en vivo) —
  // ver specs/004-eventos-gastos-y-fotos.md.
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
              <Link
                href={`/perfil/${b.userId}`}
                className="flex items-center gap-1.5 text-foreground/80 hover:underline"
              >
                <Avatar src={memberAvatar(b.userId)} name={memberName(b.userId)} size="sm" />
                {memberName(b.userId)}
              </Link>
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
            <ul className="mt-2 space-y-2 text-foreground/80">
              {settlements.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-surface-border bg-background px-3 py-2"
                >
                  <span className="flex items-center gap-1.5">
                    <Link
                      href={`/perfil/${s.from}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Avatar src={memberAvatar(s.from)} name={memberName(s.from)} size="sm" />
                      {abbreviateName(memberName(s.from))}
                    </Link>
                    <span className="text-foreground/50">→</span>
                    <span className="font-medium tabular-nums">
                      ${s.amount.toFixed(2)}
                    </span>
                    <span className="text-foreground/50">→</span>
                    <Link
                      href={`/perfil/${s.to}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Avatar src={memberAvatar(s.to)} name={memberName(s.to)} size="sm" />
                      {abbreviateName(memberName(s.to))}
                    </Link>
                    {memberAlias(s.to) && (
                      <CopyableText text={memberAlias(s.to)!}>
                        <span className="text-foreground/50">
                          (alias: {memberAlias(s.to)})
                        </span>
                      </CopyableText>
                    )}
                  </span>
                  <ReportPaymentButton
                    groupId={groupId}
                    fromUserId={s.from}
                    toUserId={s.to}
                    fromName={memberName(s.from)}
                    toName={memberName(s.to)}
                    suggestedAmount={s.amount}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(debtPayments ?? []).length > 0 && (
          <Card className="mt-4 p-4 text-sm">
            <h3 className="font-medium text-foreground/70">Pagos registrados</h3>
            <ul className="mt-2 space-y-2 text-foreground/80">
              {(debtPayments ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-surface-border bg-background px-3 py-2"
                >
                  <span className="flex items-center gap-1.5">
                    {abbreviateName(memberName(p.from_user_id))}
                    <span className="text-foreground/50">→</span>
                    <span className="font-medium tabular-nums">
                      ${Number(p.amount).toFixed(2)}
                    </span>
                    <span className="text-foreground/50">→</span>
                    {abbreviateName(memberName(p.to_user_id))}
                    <span className="text-xs text-foreground/50">
                      {new Date(p.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </span>
                  {p.reported_by === user?.id && (
                    <DeleteDebtPaymentButton groupId={groupId} paymentId={p.id} />
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
            <li key={m.id}>
              <Link
                href={`/perfil/${m.id}`}
                className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 text-xs text-foreground/80 transition-colors duration-200 hover:bg-surface-border"
              >
                <Avatar src={m.avatar_url} name={m.name ?? m.email} size="sm" />
                {m.name ?? m.email}
              </Link>
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
          {!canAddExpense ? (
            <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-foreground/50">
              Necesitás ser parte de este grupo para cargar un gasto.
            </p>
          ) : payerOptions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-foreground/50">
              Todavía nadie confirmó asistencia a este evento, no hay entre
              quién elegir.
            </p>
          ) : (
            <AddExpenseForm
              groupId={groupId}
              people={payerOptions}
              defaultParticipantIds={expenseParticipantDefaults}
              items={insumoItems ?? []}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground/50">Gastos</h2>
        <ul className="mt-2 divide-y divide-surface-border">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <span>
                    {expenseIcon(e) && <span aria-hidden="true">{expenseIcon(e)} </span>}
                    {e.description}
                  </span>
                  <ExpenseIconEditor
                    expenseId={e.id}
                    itemId={e.item_id}
                    currentIcon={expenseIcon(e)}
                    isAdmin={isAdmin}
                  />
                </p>
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
