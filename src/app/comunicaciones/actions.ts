"use server";

import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/send";

// Mismo patrón que updateInsumoItemIcon (eventos/actions.ts): la policy
// RLS de get_push_subscriptions_for_users ya exige estar autenticado,
// pero el admin-check real acá es de aplicación (no hay una tabla propia
// que proteger con RLS por fila) — se revalida por las dudas para un
// mensaje claro en vez de simplemente no enviar nada.
export async function sendAdminPush(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return { error: "No tenés permisos de administrador." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all");
  const selectedIds = formData.getAll("memberIds").map(String);

  if (!title) return { error: "Poné un título." };
  if (!body) return { error: "Poné un mensaje." };

  let targetIds: string[];
  if (audience === "selected") {
    if (selectedIds.length === 0) return { error: "Elegí al menos un miembro." };
    targetIds = selectedIds;
  } else {
    const { data: allProfiles } = await supabase.from("profiles").select("id");
    targetIds = (allProfiles ?? []).map((p) => p.id);
  }

  const { subscriptionCount } = await sendPushToUsers(
    supabase,
    targetIds,
    {
      title: `📣 ${title}`,
      body: `"${body}"`,
      url: url || undefined,
    },
    { kind: "comunicacion_manual", sentBy: user.id },
  );

  return { ok: true, targetCount: targetIds.length, subscriptionCount };
}
