import { createClient } from "@/lib/supabase/server";
import { getBaseUrls } from "@/lib/googlePhotos/mediaItems";
import { PhotoGalleryClient, type GalleryPhoto } from "./PhotoGalleryClient";

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

  // legacy=false: mismo filtro que ya usa la galería de un evento
  // (0009_legacy_photos.sql) — esas 4 fotos son de antes de que
  // existiera una asociación real foto↔evento y quedaron atadas al
  // primer evento que existía en ese momento solo por la restricción de
  // clave foránea, no porque de verdad sean de ese evento. En el
  // carrusel de la landing no importa (se muestran sin metadata), pero
  // acá sí, porque /fotos les atribuye un evento y una fecha.
  let query = supabase
    .from("event_media")
    .select("id, event_id, uploaded_by, storage_path, created_at, google_media_item_id, taken_at")
    .eq("legacy", false)
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
  // fue borrado a mano desde Google Photos. `download: true` agrega
  // Content-Disposition: attachment — necesario para que el botón de
  // descarga funcione como descarga real y no como "abrir en pestaña
  // nueva" (no afecta que la misma URL se use en un <img> para mostrar
  // el thumbnail/detalle, el navegador la renderiza igual).
  const allPaths = (mediaRows ?? []).map((r) => r.storage_path);
  const { data: fallbackSigned } =
    allPaths.length > 0
      ? await supabase.storage
          .from("event-photos")
          .createSignedUrls(allPaths, 3600, { download: true })
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
      // Original real vía Google si ya está sincronizada; si no, se
      // ofrece igual el preview de Supabase como descarga — toda foto
      // tiene que poder bajarse, aunque no sea su tamaño original.
      downloadUrl: baseUrl ? `${baseUrl}=d` : (fallbackUrl ?? null),
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
    </div>
  );
}
