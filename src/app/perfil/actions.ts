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
