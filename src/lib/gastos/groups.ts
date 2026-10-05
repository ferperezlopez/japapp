import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPendingSettlement, type ExpenseForBalance, type PaymentForBalance } from "./balances";

export interface GroupWithEventDate {
  id: string;
  name: string;
  created_at: string;
  eventDate: string | null;
  // Mismo criterio que "Para saldar cuentas" en /gastos/[groupId] — true
  // mientras quede alguna transferencia pendiente de hacer, calculado acá
  // en batch para que /gastos pueda destacar el/los grupo(s) vigente(s).
  hasPendingBalance: boolean;
}

// Grupos de gastos de los que el usuario es miembro, con la fecha del
// evento enlazado (si tiene uno) — usado tanto por la lista principal de
// /gastos como por /gastos/historicos para decidir qué es "vigente" y qué
// ya pasó. Ver specs/009-historicos-de-gastos.md.
export async function getGroupsWithEventDates(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GroupWithEventDate[]> {
  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at)")
    .eq("user_id", userId);

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is { id: string; name: string; created_at: string } => !!g);

  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const [{ data: linkedEvents }, { data: allMembers }, { data: expenseRows }, { data: paymentRows }] =
    await Promise.all([
      supabase.from("events").select("group_id, event_date").in("group_id", groupIds),
      supabase.from("group_members").select("group_id, user_id").in("group_id", groupIds),
      supabase.from("expenses").select("id, group_id, paid_by").in("group_id", groupIds),
      supabase
        .from("debt_payments")
        .select("group_id, from_user_id, to_user_id, amount")
        .in("group_id", groupIds),
    ]);

  const eventDateByGroup = new Map<string, string>();
  for (const e of linkedEvents ?? []) {
    if (e.group_id) eventDateByGroup.set(e.group_id, e.event_date);
  }

  const expenseIds = (expenseRows ?? []).map((e) => e.id);
  const { data: shareRows } =
    expenseIds.length > 0
      ? await supabase
          .from("expense_shares")
          .select("expense_id, user_id, share_amount")
          .in("expense_id", expenseIds)
      : { data: [] as { expense_id: string; user_id: string; share_amount: number }[] };

  const sharesByExpense = new Map<string, { userId: string; amount: number }[]>();
  for (const s of shareRows ?? []) {
    const list = sharesByExpense.get(s.expense_id) ?? [];
    list.push({ userId: s.user_id, amount: s.share_amount });
    sharesByExpense.set(s.expense_id, list);
  }

  const membersByGroup = new Map<string, Set<string>>();
  for (const m of allMembers ?? []) {
    const set = membersByGroup.get(m.group_id) ?? new Set<string>();
    set.add(m.user_id);
    membersByGroup.set(m.group_id, set);
  }

  const expensesByGroup = new Map<string, ExpenseForBalance[]>();
  for (const e of expenseRows ?? []) {
    const list = expensesByGroup.get(e.group_id) ?? [];
    list.push({ paidBy: e.paid_by, shares: sharesByExpense.get(e.id) ?? [] });
    expensesByGroup.set(e.group_id, list);
  }

  const paymentsByGroup = new Map<string, PaymentForBalance[]>();
  for (const p of paymentRows ?? []) {
    const list = paymentsByGroup.get(p.group_id) ?? [];
    list.push({ from: p.from_user_id, to: p.to_user_id, amount: p.amount });
    paymentsByGroup.set(p.group_id, list);
  }

  return groups.map((g) => {
    const groupExpenses = expensesByGroup.get(g.id) ?? [];
    const groupPayments = paymentsByGroup.get(g.id) ?? [];
    // Mismo criterio que /gastos/[groupId]/page.tsx: unión de los
    // miembros formales con cualquiera que aparezca pagando/participando
    // sin serlo (ver comentario de "relevantIds" ahí) — si no, un balance
    // de alguien no-miembro se perdería en silencio.
    const relevantIds = new Set<string>(membersByGroup.get(g.id) ?? []);
    for (const e of groupExpenses) {
      relevantIds.add(e.paidBy);
      for (const s of e.shares) relevantIds.add(s.userId);
    }
    for (const p of groupPayments) {
      relevantIds.add(p.from);
      relevantIds.add(p.to);
    }
    return {
      ...g,
      eventDate: eventDateByGroup.get(g.id) ?? null,
      hasPendingBalance: hasPendingSettlement([...relevantIds], groupExpenses, groupPayments),
    };
  });
}

// Fecha efectiva de un grupo para ordenar/mostrar: la del evento enlazado,
// o `created_at` para uno standalone. Usado por /gastos y /gastos/historicos
// para que ambas páginas ordenen y corten la lista de forma consistente —
// "histórico" ya no es "evento pasado", es "no entra en el top 5" (ver
// specs/009-historicos-de-gastos.md).
export function sortGroupsByRecency(groups: GroupWithEventDate[]): GroupWithEventDate[] {
  return [...groups].sort((a, b) => (b.eventDate ?? b.created_at).localeCompare(a.eventDate ?? a.created_at));
}

export function formatGroupDateLabel(group: GroupWithEventDate, formatter: Intl.DateTimeFormat): string {
  return group.eventDate
    ? formatter.format(new Date(group.eventDate))
    : `Creado el ${formatter.format(new Date(group.created_at))}`;
}
