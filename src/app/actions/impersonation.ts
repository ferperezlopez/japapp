"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/supabase/actingUser";

// "Actuar como" otro usuario: mientras la cookie está activa, las
// escrituras/lecturas que pasan por getActingUser() quedan atribuidas al
// usuario impersonado, no al admin real. maxAge de 8 horas para que una
// impersonación olvidada no quede activa por días.
export async function startImpersonation(targetUserId: string) {
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

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) return { error: "Usuario no encontrado." };

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, targetUserId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}
