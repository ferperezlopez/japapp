import { createClient } from "@/lib/supabase/server";
import { getBaseUrls } from "@/lib/googlePhotos/mediaItems";
import { PhotoGalleryClient, type GalleryPhoto } from "./PhotoGalleryClient";
import { MigrateOldPhotosButton } from "./MigrateOldPhotosButton";

const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

// Sin paginación real todavía (ver specs/019-fotos-y-google-photos.md) —
// mismo criterio que ya usa el pool general de la landing
// (src/app/page.tsx, tope de 60): para el volumen de fotos de un grupo
// chico alcanza con un tope generoso, la paginación queda para más
// adelante si hace falta.
const PHOTOS_LIMIT = 500;

export default async function FotosPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { event: eventIdFilter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">Iniciá sesión para ver esta sección.</p>
      </div>
    );
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = me?.is_admin ?? false;

  let query = supabase
    .from("event_media")
    .select("id, event_id, uploaded_by, storage_path, created_at, google_media_item_id, taken_at")
    .order("taken_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PHOTOS_LIMIT);

  if (eventIdFilter) query = query.eq("event_id", eventIdFilter);

  const { data: mediaRows } = await query;

  // Mismo criterio que el resto de la app (ver comunicaciones/page.tsx,
  // gastos/[groupId]/page.tsx): joins resueltos con Maps en vez de
  // selects embebidos, para no depender de cómo tipa Supabase el embed.
  const eventIds = [...new Set((mediaRows ?? []).map((r) => r.event_id))];
  const uploaderIds = [...new Set((mediaRows ?? []).map((r) => r.uploaded_by))];

  const [{ data: events }, { data: uploaders }] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("events").select("id, name").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    uploaderIds.length > 0
      ? supabase.from("profiles").select("id, name, email").in("id", uploaderIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; email: string }[] }),
  ]);

  const eventNameById = new Map((events ?? []).map((e) => [e.id, e.name]));
  const uploaderNameById = new Map((uploaders ?? []).map((p) => [p.id, p.name ?? p.email]));

  const googleIds = (mediaRows ?? [])
    .map((r) => r.google_media_item_id)
    .filter((id): id is string => !!id);
  const baseUrls = await getBaseUrls(googleIds);

  // Se firman TODOS los preview (no solo los que todavía no tienen
  // Google Photos) — sirve de respaldo si la API de Google no está
  // configurada, si falló puntualmente el batchGet, o si el media item
  // fue borrado a mano desde Google Photos.
  const allPaths = (mediaRows ?? []).map((r) => r.storage_path);
  const { data: fallbackSigned } =
    allPaths.length > 0
      ? await supabase.storage.from("event-photos").createSignedUrls(allPaths, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] };
  const fallbackUrlByPath = new Map(
    (fallbackSigned ?? []).map((s) => [s.path, s.signedUrl]),
  );

  const photos: GalleryPhoto[] = [];
  for (const row of mediaRows ?? []) {
    const baseUrl = row.google_media_item_id ? baseUrls.get(row.google_media_item_id) : undefined;
    const fallbackUrl = fallbackUrlByPath.get(row.storage_path);
    const thumbUrl = baseUrl ? `${baseUrl}=w500-h500-c` : fallbackUrl;
    const detailUrl = baseUrl ? `${baseUrl}=w2000` : fallbackUrl;
    if (!thumbUrl || !detailUrl) continue;

    photos.push({
      id: row.id,
      eventName: eventNameById.get(row.event_id) ?? "Evento",
      takenAt: row.taken_at ?? row.created_at,
      uploadedByName: uploaderNameById.get(row.uploaded_by) ?? "Alguien",
      thumbUrl,
      detailUrl,
      downloadUrl: baseUrl ? `${baseUrl}=d` : null,
    });
  }

  // Los datos ya vienen ordenados desc de la query — agrupar preservando
  // ese orden alcanza, sin necesidad de reordenar los grupos.
  const groups: [string, GalleryPhoto[]][] = [];
  const groupIndexByLabel = new Map<string, number>();
  for (const photo of photos) {
    const label = monthFormatter.format(new Date(photo.takenAt));
    let index = groupIndexByLabel.get(label);
    if (index === undefined) {
      index = groups.length;
      groupIndexByLabel.set(label, index);
      groups.push([label, []]);
    }
    groups[index][1].push(photo);
  }

  let pendingBackfillCount = 0;
  if (isAdmin) {
    const { count } = await supabase
      .from("event_media")
      .select("id", { count: "exact", head: true })
      .is("google_media_item_id", null)
      .is("original_staging_path", null);
    pendingBackfillCount = count ?? 0;
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">Recuerdos</p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">Fotos</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Todas las fotos de los eventos, de más recientes a menos recientes.
      </p>

      <div className="mt-6">
        <PhotoGalleryClient groups={groups} />
      </div>

      {isAdmin && (
        <details className="mt-10 rounded-xl border border-surface-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Migrar fotos existentes a Google Photos
          </summary>
          <div className="mt-2">
            <MigrateOldPhotosButton initialRemaining={pendingBackfillCount} />
          </div>
        </details>
      )}
    </div>
  );
}
