import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { syncEventMediaToGooglePhotos } from "@/lib/googlePhotos/sync";
import { checkMediaItemsExist } from "@/lib/googlePhotos/mediaItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dos pasadas independientes, en el mismo cron diario para no sumar otro
// job (el plan de Vercel de este proyecto corre cron jobs una vez al
// día) — ver specs/019-fotos-y-google-photos.md:
//
// 1) Reintento: fotos que quedaron sin subir a Google Photos (token
//    vencido, error transitorio) — ver
//    src/app/eventos/actions.ts:addEventMedia. El objeto de tránsito no
//    se borra hasta que la subida tiene éxito, así que
//    original_staging_path no nulo es la señal de "falta reintentar".
//
// 2) Reconciliación: si Fernando borra una foto directo desde Google
//    Photos, deja de existir ahí — se la saca también de la app
//    (fila + preview en Supabase). Solo se borra ante una confirmación
//    explícita de "no existe" de Google (`checkMediaItemsExist`
//    distingue eso de una llamada que simplemente falló); ante la duda,
//    no se toca nada.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: pending } = await supabase
    .from("event_media")
    .select("id, original_staging_path")
    .is("google_media_item_id", null)
    .not("original_staging_path", "is", null)
    .limit(20);

  let synced = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    if (!row.original_staging_path) continue;
    const result = await syncEventMediaToGooglePhotos(supabase, {
      mediaId: row.id,
      bucket: "event-photos-originals",
      path: row.original_staging_path,
      deleteSourceOnSuccess: true,
    });
    if ("error" in result) {
      failed += 1;
      console.error("Reintento de sync a Google Photos falló:", row.id, result.error);
    } else {
      synced += 1;
    }
  }

  const { data: syncedRows } = await supabase
    .from("event_media")
    .select("id, storage_path, google_media_item_id")
    .not("google_media_item_id", "is", null)
    .limit(2000);

  const idsToCheck = (syncedRows ?? [])
    .map((r) => r.google_media_item_id)
    .filter((id): id is string => !!id);
  const existsById = await checkMediaItemsExist(idsToCheck);

  let reconciledDeletes = 0;
  for (const row of syncedRows ?? []) {
    if (!row.google_media_item_id) continue;
    if (existsById.get(row.google_media_item_id) !== false) continue;

    await supabase.storage.from("event-photos").remove([row.storage_path]);
    await supabase.from("event_media").delete().eq("id", row.id);
    reconciledDeletes += 1;
  }

  return NextResponse.json({
    ok: true,
    checked: pending?.length ?? 0,
    synced,
    failed,
    reconciledDeletes,
  });
}
