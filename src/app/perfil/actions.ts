"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateAlias(formData: FormData) {
  const alias = String(formData.get("alias") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error } = await supabase
    .from("profiles")
    .update({ alias: alias || null })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/perfil");
  revalidatePath("/gastos");
  return { ok: true };
}

export async function updateAvatar(avatarUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/perfil");
  revalidatePath("/eventos");
  revalidatePath("/gastos");
  revalidatePath("/");
  return { ok: true };
}

// Editar el perfil de otra persona como admin — mecanismo separado de
// "actuar como" (ver src/lib/supabase/actingUser.ts): esto es una edición
// directa, sin activar ningún modo de impersonación. La policy RLS "Un
// admin puede editar cualquier perfil" (0023_admin_role.sql) es la barrera
// real; acá se revalida el flag por las dudas para devolver un mensaje
// claro en vez de un error crudo de Postgres.
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No estás logueado." as const };

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return { error: "No tenés permisos de administrador." as const };

  return { user };
}

export async function adminUpdateProfile(targetUserId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();

  const supabase = await createClient();
  const check = await requireAdmin(supabase);
  if ("error" in check) return { error: check.error };

  const { error } = await supabase
    .from("profiles")
    .update({ name: name || null, alias: alias || null })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  revalidatePath(`/perfil/${targetUserId}`);
  revalidatePath("/miembros");
  revalidatePath("/gastos");
  return { ok: true };
}

export async function adminUpdateAvatar(targetUserId: string, avatarUrl: string) {
  const supabase = await createClient();
  const check = await requireAdmin(supabase);
  if ("error" in check) return { error: check.error };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  revalidatePath(`/perfil/${targetUserId}`);
  revalidatePath("/miembros");
  revalidatePath("/eventos");
  revalidatePath("/gastos");
  revalidatePath("/");
  return { ok: true };
}
