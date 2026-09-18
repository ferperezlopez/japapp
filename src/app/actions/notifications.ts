"use server";

import { createClient } from "@/lib/supabase/server";

// Atado al usuario real (auth.getUser(), no getActingUser): la campanita
// es un estado de "qué vio esta persona en este dispositivo/sesión",
// mismo criterio que las suscripciones push (src/app/actions/push.ts) —
// no tiene sentido atribuírselo a quien está siendo impersonado.
export async function getMyNotifications() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: recipientRows } = await supabase
    .from("notification_recipients")
    .select("id, send_id, read_at")
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(30);
  if (!recipientRows || recipientRows.length === 0) return [];

  const { data: sends } = await supabase
    .from("notification_sends")
    .select("id, title, body, url, created_at")
    .in(
      "id",
      recipientRows.map((r) => r.send_id),
    );
  const sendById = new Map((sends ?? []).map((s) => [s.id, s]));

  return recipientRows
    .map((row) => {
      const send = sendById.get(row.send_id);
      if (!send) return null;
      return {
        id: row.id,
        unread: row.read_at === null,
        title: send.title,
        body: send.body,
        url: send.url,
        createdAt: send.created_at,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getMyUnreadNotificationCount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notification_recipients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

// Marca todo lo no leído como leído de una — la campanita muestra la
// lista completa al abrirse, no hace falta granularidad por ítem.
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  return { ok: true };
}
