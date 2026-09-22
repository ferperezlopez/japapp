import { createClient } from "@/lib/supabase/server";
import { AdminCommsForm } from "./AdminCommsForm";
import { NOTIFICATION_KIND_LABELS, automaticSourceLabel } from "@/lib/push/notificationKinds";

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ComunicacionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">Iniciá sesión para ver esta sección.</p>
      </div>
    );
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">
          No tenés permisos para ver esta sección.
        </p>
      </div>
    );
  }

  // push_subscriptions solo deja ver las propias filas por RLS — para
  // listar quién de todo el grupo activó las notificaciones hace falta
  // la función security definer get_push_subscriber_ids (ver
  // 0029_admin_list_push_subscribers.sql), que valida is_admin adentro.
  const [{ data: members }, { data: subscribers }] = await Promise.all([
    supabase.from("profiles").select("id, name, email").order("name"),
    supabase.rpc("get_push_subscriber_ids"),
  ]);

  const subscribedIds = new Set((subscribers ?? []).map((s) => s.user_id));
  const optedInCount = (members ?? []).filter((m) => subscribedIds.has(m.id)).length;

  // Log de comunicaciones (specs/018): reusa el `members` ya traído
  // arriba para resolver nombres, en vez de un join embebido nuevo.
  const nameById = new Map((members ?? []).map((m) => [m.id, m.name ?? m.email]));

  const { data: sends } = await supabase
    .from("notification_sends")
    .select("id, kind, sent_by, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const sendIds = (sends ?? []).map((s) => s.id);
  const { data: recipientRows } =
    sendIds.length > 0
      ? await supabase
          .from("notification_recipients")
          .select("send_id, user_id")
          .in("send_id", sendIds)
      : { data: [] };

  const recipientsBySend = new Map<string, string[]>();
  for (const row of recipientRows ?? []) {
    const names = recipientsBySend.get(row.send_id) ?? [];
    names.push(nameById.get(row.user_id) ?? "?");
    recipientsBySend.set(row.send_id, names);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-ink">
        Admin
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Notificaciones
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Mandá una notificación push a todo el grupo o a un grupo elegido de
        miembros. Solo le llega a quien haya activado las notificaciones
        desde su perfil.
      </p>

      <div className="mt-6">
        <AdminCommsForm members={members ?? []} subscribedIds={[...subscribedIds]} />
      </div>

      <div className="mt-8">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Historial de envíos
        </h2>
        <p className="mt-1 text-xs text-foreground/50">
          Últimos {(sends ?? []).length} envíos, automáticos y manuales.
        </p>
        {(sends ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-foreground/60">Todavía no se envió nada.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(sends ?? []).map((send) => {
              const sender = send.sent_by
                ? (nameById.get(send.sent_by) ?? "Alguien")
                : automaticSourceLabel(send.kind);
              const recipients = recipientsBySend.get(send.id) ?? [];
              return (
                <li
                  key={send.id}
                  className="rounded-xl border border-surface-border bg-surface p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
                      {NOTIFICATION_KIND_LABELS[send.kind]}
                    </span>
                    <span className="text-xs text-foreground/40">
                      {dateTimeFormatter.format(new Date(send.created_at))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">{sender}</p>
                  <p className="mt-2 font-medium text-foreground">{send.title}</p>
                  <p className="mt-0.5 text-foreground/70">{send.body}</p>
                  <p className="mt-2 text-xs text-foreground/50">
                    Destinatarios ({recipients.length}): {recipients.join(", ") || "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="mt-8 rounded-xl border border-surface-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Quién recibe notificaciones ({optedInCount}/{(members ?? []).length})
        </summary>
        <ul className="mt-2 divide-y divide-surface-border">
          {(members ?? []).map((member) => {
            const optedIn = subscribedIds.has(member.id);
            return (
              <li key={member.id} className="flex items-center justify-between py-1.5">
                <span className="text-foreground">{member.name ?? member.email}</span>
                {optedIn ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    🔔 Activadas
                  </span>
                ) : (
                  <span className="text-xs text-foreground/40">🔕 No activadas</span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
