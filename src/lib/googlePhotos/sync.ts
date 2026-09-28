import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { uploadOriginalToGooglePhotos } from "./upload";

// Sincroniza una fila de event_media con Google Photos: descarga los
// bytes de `bucket`/`path`, los sube, y actualiza la fila con la
// metadata devuelta. Se reusa desde tres lugares con distinta fuente de
// bytes: el upload nuevo y el cron de reintento (bucket de tránsito
// `event-photos-originals`, se borra al terminar) y el backfill de fotos
// viejas (bucket `event-photos`, el preview ya guardado — no hay un
// original mejor que ese para lo que se subió antes de este cambio, ver
// specs/019-fotos-y-google-photos.md, no se borra nunca).
export async function syncEventMediaToGooglePhotos(
  supabase: SupabaseClient<Database>,
  params: { mediaId: string; bucket: string; path: string; deleteSourceOnSuccess: boolean },
): Promise<{ ok: true } | { error: string }> {
  const { mediaId, bucket, path, deleteSourceOnSuccess } = params;

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(path);
  if (downloadError || !fileBlob) {
    return { error: downloadError?.message ?? "No se pudo leer el archivo." };
  }

  const bytes = Buffer.from(await fileBlob.arrayBuffer());
  const filename = path.split("/").pop() ?? path;
  const mimeType = fileBlob.type || "application/octet-stream";
  const result = await uploadOriginalToGooglePhotos(bytes, mimeType, filename);
  if ("error" in result) return { error: result.error };

  const { error: updateError } = await supabase
    .from("event_media")
    .update({
      google_media_item_id: result.mediaItemId,
      taken_at: result.takenAt,
      width: result.width,
      height: result.height,
      original_staging_path: null,
    })
    .eq("id", mediaId);
  if (updateError) return { error: updateError.message };

  if (deleteSourceOnSuccess) {
    await supabase.storage.from(bucket).remove([path]);
  }

  return { ok: true };
}
