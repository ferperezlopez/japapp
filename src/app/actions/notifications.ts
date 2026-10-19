"use server";

import { createClient } from "@/lib/supabase/server";

// Cuántos avisos muestra la campanita (y /notificaciones): los más nuevos.
const VISIBLE_NOTIFICATIONS = 30;
// Tope de ids por pedido de borrado: "Borrar todas" manda los que están a la
// vista (como mucho VISIBLE_NOTIFICATIONS); esto solo acota lo que mande un
// cliente a mano.
const MAX_IDS_PER_DELETE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Atado al usuario real (auth.getUser(), no getActingUser): la campanita
// es un estado de "qué vio esta persona en este dispositivo/sesión",
// mismo criterio que las suscripciones push (src/app/actions/push.ts) —
// no tiene sentido atribuírselo a quien está siendo impersonado.
//
// Se lee desde notification_sends (con el renglón del destinatario embebido,
// `!inner` + filtro por usuario) para poder ordenar por la fecha del envío:
// notification_recipients no tiene fecha propia y su id es un uuid al azar,
// así que ordenar por ahí y cortar en 30 mostraba 30 avisos cualquiera, no
// los más nuevos. El filtro por usuario es necesario aunque RLS ya limite lo
// que ve cada uno: un admin ve los destinatarios de todos.
//
// `id` es el id del renglón del destinatario (lo que se borra), no el del
// envío. Los borrados (deleted_at) no se listan.
export async function getMyNotifications() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: sends, error } = await supabase
    .from("notification_sends")
    .select("id, title, body, url, created_at, notification_recipients!inner(id, read_at)")
    .eq("notification_recipients.user_id", user.id)
    .is("notification_recipients.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(VISIBLE_NOTIFICATIONS);
  if (error) console.error("getMyNotifications:", error.message);

  return (sends ?? []).flatMap((send) => {
    const recipient = send.notification_recipients[0];
    if (!recipient) return [];
    return [
      {
        id: recipient.id,
        unread: recipient.read_at === null,
        title: send.title,
        body: send.body,
        url: send.url,
        createdAt: send.created_at,
      },
    ];
  });
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
    .is("read_at", null)
    .is("deleted_at", null);

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

// Borra avisos de la campanita de quien llama. Recibe ids de
// notification_recipients (el `id` que devuelve getMyNotifications). Es un
// borrado lógico: ver 0042_notification_recipients_deleted_at.sql.
//
// Las server actions son endpoints POST públicos, así que se valida todo lo
// que llega y el usuario sale de la sesión: aunque el cliente mande ids de
// otra persona, el `eq("user_id")` hace que no toquen nada (y RLS lo repite).
export async function deleteNotifications(
  ids: string[],
): Promise<{ ok: true } | { error: string }> {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_IDS_PER_DELETE ||
    !ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id))
  ) {
    return { error: "No pudimos borrar. Probá de nuevo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error } = await supabase
    .from("notification_recipients")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    // El motivo real queda en el log del servidor, no en la respuesta.
    console.error("deleteNotifications:", error.message);
    return { error: "No pudimos borrar. Probá de nuevo." };
  }
  return { ok: true };
}
