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

// Dispara un push a cada suscripción (puede haber varias por persona, una
// por dispositivo) de cada userId dado. Nunca lanza si un envío puntual
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
): Promise<{ subscriptionCount: number }> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return { subscriptionCount: 0 };
  if (userIds.length === 0) return { subscriptionCount: 0 };

  const { data: subscriptions } = await supabase.rpc("get_push_subscriptions_for_users", {
    p_user_ids: userIds,
  });
  if (!subscriptions || subscriptions.length === 0) return { subscriptionCount: 0 };

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
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
