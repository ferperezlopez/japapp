import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { syncEventMediaToGooglePhotos } from "@/lib/googlePhotos/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reintento de fotos que quedaron sin subir a Google Photos (token
// vencido, error transitorio de la API) — ver
// src/app/eventos/actions.ts:addEventMedia. El objeto de tránsito no se
// borra hasta que la subida a Google tiene éxito, así que
// original_staging_path no nulo es justo la señal de "falta reintentar".
// Tope de 20 por corrida para no pasar el maxDuration.
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

  return NextResponse.json({ ok: true, checked: pending?.length ?? 0, synced, failed });
}
