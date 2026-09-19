import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = { title: string; body: string; url?: string };

// Categoriza cada envío para el log de /comunicaciones (specs/018): cada
// disparador de la app tiene su propio kind, salvo el envío manual desde
// /comunicaciones que además lleva `sentBy` (el admin que lo compuso).
// El resto queda "automático" — no se threadea el usuario actor de cada
// disparador (ver specs/018) porque lo pedido es distinguir cron/evento
// de manual, no "qué usuario lo causó".
export type NotificationKind =
  | "evento_nuevo"
  | "quorum_futbol"
  | "quorum_juntada"
  | "equipos_armados"
  | "equipos_modificados"
  | "gasto_nuevo"
  | "tarea_asignada"
  | "saldo_pendiente"
  | "comunicacion_manual";

export type NotificationMeta = { kind: NotificationKind; sentBy?: string };

// Dispara un push a cada suscripción (puede haber varias por persona, una
// por dispositivo) de cada userId dado, y deja un registro de todo envío
// (notification_sends/notification_recipients) para el log de admin y la
// campanita in-app — independiente de si el push del navegador
// efectivamente llega a algún dispositivo (por eso se loguea ANTES de
// tocar VAPID/suscripciones). Nunca lanza si un envío puntual del push
// falla — un dispositivo puede tener la suscripción vencida sin que el
// usuario haya tocado "desactivar" — así que la acción que dispara esto
// (crear un evento, etc.) no debe fallar por un push roto. Si el push
// service devuelve 404/410 (suscripción inválida), se borra esa fila vía
// `prune_push_subscription` (security definer: puede no ser la suscripción
// de quien dispara el envío). Devuelve cuántas suscripciones se
// encontraron (no cuántas efectivamente llegaron, eso no se puede saber
// desde el servidor) — usado por la sección de Comunicaciones para dar
// una idea de a cuánta gente le llegó el aviso.
export async function sendPushToUsers(
  supabase: SupabaseClient<Database>,
  userIds: string[],
  payload: PushPayload,
  meta: NotificationMeta,
): Promise<{ subscriptionCount: number }> {
  if (userIds.length === 0) return { subscriptionCount: 0 };

  // Sin link propio (hoy solo puede pasar en una comunicación manual sin
  // URL cargada — puramente informativa), el destino por default es la
  // campanita (/notificaciones) en vez de "/" — tiene más sentido llevar
  // a "el resto de tus avisos" que a Inicio a secas.
  const url = payload.url || "/notificaciones";
  const normalizedPayload = { ...payload, url };

  // Id generado acá (no vía `.select().single()` sobre el insert): un
  // INSERT ... RETURNING queda sujeto a la policy de SELECT de la
  // tabla, no solo a la de INSERT — para alguien no-admin, una fila
  // recién creada no matchea esa policy todavía (get_push_subscriber_ids
  // aparte, `notification_recipients` para esa fila ni existe hasta el
  // segundo insert de abajo), así que Postgres la rechazaba con "new row
  // violates row-level security policy" aunque el INSERT en sí esté
  // permitido para cualquier logueado.
  const sendId = crypto.randomUUID();
  const { error: sendError } = await supabase.from("notification_sends").insert({
    id: sendId,
    kind: meta.kind,
    sent_by: meta.sentBy ?? null,
    title: payload.title,
    body: payload.body,
    url,
  });
  if (!sendError) {
    await supabase
      .from("notification_recipients")
      .insert(userIds.map((userId) => ({ send_id: sendId, user_id: userId })));
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return { subscriptionCount: 0 };

  const { data: subscriptions } = await supabase.rpc("get_push_subscriptions_for_users", {
    p_user_ids: userIds,
  });
  if (!subscriptions || subscriptions.length === 0) return { subscriptionCount: 0 };

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(normalizedPayload),
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.rpc("prune_push_subscription", { p_endpoint: sub.endpoint });
        }
      }
    }),
  );

  return { subscriptionCount: subscriptions.length };
}
