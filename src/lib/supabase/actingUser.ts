import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const IMPERSONATION_COOKIE = "japapp_impersonating_as";

// Reemplaza a `supabase.auth.getUser().data.user.id` en cualquier lugar
// que grabe o lea "quién es el usuario actual": si el usuario real es
// admin y tiene una impersonación activa (cookie), la identidad efectiva
// pasa a ser la persona impersonada — mismo id se usa tanto para escribir
// (ej. setRsvp) como para leer (ej. "tu respuesta").
export async function getActingUser(supabase: SupabaseClient<Database>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const impersonatingId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!impersonatingId) return { id: user.id, isImpersonating: false as const };

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return { id: user.id, isImpersonating: false as const };

  return {
    id: impersonatingId,
    isImpersonating: true as const,
    realAdminId: user.id,
  };
}

// Para el banner: a quién se está impersonando (o null si no aplica).
export async function getImpersonationTarget(supabase: SupabaseClient<Database>) {
  const actor = await getActingUser(supabase);
  if (!actor?.isImpersonating) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .eq("id", actor.id)
    .maybeSingle();
  return data;
}
