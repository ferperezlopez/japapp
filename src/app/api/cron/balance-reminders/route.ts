import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { calcularBalances } from "@/lib/gastos/balances";
import { sendPushToUsers } from "@/lib/push/send";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

// Caso 7 de specs/017-push-notifications.md: recordatorio de saldo
// pendiente. Condición dada por el usuario: "eventoFinalizado &&
// horasDesdeFinalizacion >= 24 && usuarioTieneSaldoPendiente". Un
// evento "finaliza" en su `event_date` (no hay columna de fin
// separada). Se acota a los últimos 30 días para no re-escanear toda
// la historia — eventos más viejos ya deberían estar saldados o ya
// notificados (idempotencia real la da `balance_reminders_sent`).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = Date.now();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date, group_id")
    .not("group_id", "is", null)
    .lte("event_date", new Date(now - DAY_MS).toISOString())
    .gte("event_date", new Date(now - 30 * DAY_MS).toISOString());

  let remindersSent = 0;

  for (const event of events ?? []) {
    const groupId = event.group_id;
    if (!groupId) continue;

    const [{ data: members }, { data: expenses }, { data: alreadySent }] = await Promise.all([
      supabase.from("group_members").select("user_id").eq("group_id", groupId),
      supabase
        .from("expenses")
        .select("paid_by, expense_shares(user_id, share_amount)")
        .eq("group_id", groupId),
      supabase.from("balance_reminders_sent").select("user_id").eq("event_id", event.id),
    ]);

    const memberIds = (members ?? []).map((m) => m.user_id);
    if (memberIds.length === 0) continue;

    const balances = calcularBalances(
      memberIds,
      (expenses ?? []).map((e) => ({
        paidBy: e.paid_by,
        shares: (e.expense_shares ?? []).map((s) => ({
          userId: s.user_id,
          amount: Number(s.share_amount),
        })),
      })),
    );

    const alreadyNotifiedIds = new Set((alreadySent ?? []).map((r) => r.user_id));
    const debtorIds = balances
      .filter((b) => b.balance < -0.01 && !alreadyNotifiedIds.has(b.userId))
      .map((b) => b.userId);

    if (debtorIds.length === 0) continue;

    await sendPushToUsers(
      supabase,
      debtorIds,
      {
        title: "💸 No te hagas el distraído…",
        body: `Todavía tenés cuentas pendientes de ${event.name}. Entrá y dejá todo saldado. 👀`,
        url: `/gastos/${groupId}`,
      },
      { kind: "saldo_pendiente" },
    );

    await supabase
      .from("balance_reminders_sent")
      .insert(debtorIds.map((userId) => ({ event_id: event.id, user_id: userId })));

    remindersSent += debtorIds.length;
  }

  return NextResponse.json({ ok: true, eventsChecked: events?.length ?? 0, remindersSent });
}
