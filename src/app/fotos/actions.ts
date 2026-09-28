"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncEventMediaToGooglePhotos } from "@/lib/googlePhotos/sync";

const BACKFILL_BATCH_SIZE = 15;

// Migra de a lotes las fotos que ya estaban en Supabase antes de este
// cambio: no tienen google_media_item_id ni un original en tránsito
// pendiente (esas las retoma el cron, no esta action — usan el archivo
// real, no el preview). Sube el preview que ya existe en `event-photos`
// a Google Photos: no hay un original mejor guardado que ese para fotos
// de antes de este cambio (ver specs/019-fotos-y-google-photos.md).
// Admin-only, pensado para clickearse varias veces hasta terminar.
export async function migrateExistingPhotosToGooglePhotos(): Promise<
  { error: string } | { ok: true; migrated: number; failed: number; remaining: number }
> {
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

  const { data: pending } = await supabase
    .from("event_media")
    .select("id, storage_path")
    .is("google_media_item_id", null)
    .is("original_staging_path", null)
    .limit(BACKFILL_BATCH_SIZE);

  let migrated = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    const result = await syncEventMediaToGooglePhotos(supabase, {
      mediaId: row.id,
      bucket: "event-photos",
      path: row.storage_path,
      deleteSourceOnSuccess: false,
    });
    if ("error" in result) failed += 1;
    else migrated += 1;
  }

  const { count: remaining } = await supabase
    .from("event_media")
    .select("id", { count: "exact", head: true })
    .is("google_media_item_id", null)
    .is("original_staging_path", null);

  revalidatePath("/fotos");
  return { ok: true as const, migrated, failed, remaining: remaining ?? 0 };
}
