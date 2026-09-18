import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { sendPushToUsers } from "./send";

// Fijo para las dos modalidades — decisión explícita del usuario, no
// configurable por evento (ver specs/017-push-notifications.md).
const QUORUM = 8;

// Debounce de 1 minuto pedido explícitamente por el usuario: si alguien
// confirma sin querer justo cuando se llega al quórum y se arrepiente al
// toque, no queremos haber mandado ya el aviso a todo el mundo. Se
// implementa con `after()` (corre después de responder al cliente, sin
// bloquear la acción que lo disparó) en vez de un cron — no hace falta
// infra nueva para algo que se resuelve en la misma request.
const DEBOUNCE_MS = 60_000;

type Kind = "futbol" | "juntada";

const COPY: Record<Kind, { title: string; body: (count: number, eventName: string) => string }> = {
  futbol: {
    title: "⚽ ¡Hay equipo!",
    body: (count, eventName) => `Llegamos a ${count} confirmados para ${eventName}. Esto se juega.`,
  },
  juntada: {
    title: "🍻 ¡Hay JAPA!",
    body: (count, eventName) => `Ya somos ${count} confirmados para ${eventName}. Esto tomó forma.`,
  },
};

async function countConfirmed(supabase: SupabaseClient<Database>, eventId: string, kind: Kind) {
  const [{ count: rsvpCount }, { count: guestCount }] = await Promise.all([
    supabase
      .from("event_rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("kind", kind)
      .eq("status", "yes"),
    supabase
      .from("event_guests")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("kind", kind),
  ]);
  return (rsvpCount ?? 0) + (guestCount ?? 0);
}

// Update condicional sobre el flag de "ya notificado": si otro disparo
// concurrente ya lo puso en true, esto no afecta ninguna fila y devuelve
// null — evita mandar el mismo aviso dos veces si dos personas cruzaron
// el umbral casi al mismo tiempo. Ramificado a mano por `kind` (en vez
// de una key computada) para que el `update` siga siendo type-safe.
async function claimNotification(
  supabase: SupabaseClient<Database>,
  eventId: string,
  kind: Kind,
) {
  if (kind === "futbol") {
    const { data } = await supabase
      .from("events")
      .update({ futbol_quorum_notified: true })
      .eq("id", eventId)
      .eq("futbol_quorum_notified", false)
      .select("id")
      .maybeSingle();
    return data;
  }
  const { data } = await supabase
    .from("events")
    .update({ juntada_quorum_notified: true })
    .eq("id", eventId)
    .eq("juntada_quorum_notified", false)
    .select("id")
    .maybeSingle();
  return data;
}

// Se llama después de cualquier acción que pueda sumar una confirmación
// (setRsvp a "yes", addGuestToEvent) — nunca hace falta llamarla desde
// acciones que solo pueden restar (sacar invitado, RSVP a "no"/"maybe"),
// porque el cruce del umbral es un evento de "subida" únicamente.
export async function maybeNotifyQuorum(
  supabase: SupabaseClient<Database>,
  eventId: string,
  kind: Kind,
) {
  const { data: event } = await supabase
    .from("events")
    .select("id, name, futbol_quorum_notified, juntada_quorum_notified")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return;

  const alreadyNotified =
    kind === "futbol" ? event.futbol_quorum_notified : event.juntada_quorum_notified;
  if (alreadyNotified) return;

  const count = await countConfirmed(supabase, eventId, kind);
  if (count < QUORUM) return;

  const eventName = event.name;

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));

    const stillCount = await countConfirmed(supabase, eventId, kind);
    if (stillCount < QUORUM) return;

    const claimed = await claimNotification(supabase, eventId, kind);
    if (!claimed) return;

    const { data: confirmed } = await supabase
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("kind", kind)
      .eq("status", "yes");

    const targetIds = (confirmed ?? []).map((r) => r.user_id);
    if (targetIds.length === 0) return;

    const { title, body } = COPY[kind];
    await sendPushToUsers(supabase, targetIds, {
      title,
      body: body(stillCount, eventName),
      url: `/eventos/${eventId}`,
    });
  });
}
