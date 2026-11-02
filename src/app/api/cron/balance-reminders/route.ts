import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { debtorsToRemind } from "@/lib/gastos/reminders";
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
//
// "Saldo pendiente" es lo que la persona todavía debe DESPUÉS de los pagos
// informados (debt_payments): el mismo criterio que "Para saldar cuentas" en
// /gastos/[groupId]. Antes el cron los dejaba afuera y le avisaba a quien ya
// había pagado y lo había informado (ver debtorsToRemind).
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
  let eventsSkipped = 0;

  for (const event of events ?? []) {
    const groupId = event.group_id;
    if (!groupId) continue;

    const [expenses, payments, alreadySent] = await Promise.all([
      supabase
        .from("expenses")
        .select("paid_by, expense_shares(user_id, share_amount)")
        .eq("group_id", groupId),
      supabase
        .from("debt_payments")
        .select("from_user_id, to_user_id, amount")
        .eq("group_id", groupId),
      supabase.from("balance_reminders_sent").select("user_id").eq("event_id", event.id),
    ]);

    // Con una lectura fallida el cálculo saldría con datos incompletos (sin los
    // pagos, por ejemplo, y se le avisaría a quien ya pagó): mejor no avisar hoy.
    // El evento sigue dentro de la ventana de 30 días y se reintenta en la
    // próxima corrida.
    const failed = expenses.error ?? payments.error ?? alreadySent.error;
    if (failed) {
      console.error(`balance-reminders: se saltea el evento ${event.id}: ${failed.message}`);
      eventsSkipped += 1;
      continue;
    }

    const debtorIds = debtorsToRemind({
      expenses: (expenses.data ?? []).map((e) => ({
        paidBy: e.paid_by,
        shares: (e.expense_shares ?? []).map((s) => ({
          userId: s.user_id,
          amount: Number(s.share_amount),
        })),
      })),
      payments: (payments.data ?? []).map((p) => ({
        from: p.from_user_id,
        to: p.to_user_id,
        amount: Number(p.amount),
      })),
      alreadyNotifiedIds: (alreadySent.data ?? []).map((r) => r.user_id),
    });

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

  return NextResponse.json({
    ok: true,
    eventsChecked: events?.length ?? 0,
    eventsSkipped,
    remindersSent,
  });
}
