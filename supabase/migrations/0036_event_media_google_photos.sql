-- JAPapp: las fotos de evento pasan a guardar su archivo original en
-- Google Photos (cuenta personal de Fernando, 2TB) en vez de solo en
-- Supabase Storage — Free tier no banca fotos en tamaño real (tope de
-- 50MB por objeto, y hoy ya se resamplea todo a 1600px antes de subir).
-- Ver specs/019-fotos-y-google-photos.md.
--
-- Modelo: dos copias por foto. `storage_path` (ya existía) sigue siendo
-- el preview comprimido en Supabase (rápido, sin depender de la API de
-- Google para mostrarse). El original se sube server-side a Google
-- Photos vía un bucket de tránsito (`event-photos-originals`): el
-- browser lo sube ahí directo (mismo patrón que ya usa `event-photos`,
-- evita mandar el binario por una server action), el servidor lo
-- descarga de ahí, lo resube a Google, y borra el objeto de tránsito.
-- `original_staging_path` queda en null una vez sincronizado; si la
-- sincronización falla, se deja seteado para que el cron de reintento
-- lo encuentre.

alter table public.event_media
  add column google_media_item_id text,
  add column taken_at timestamptz,
  add column width integer,
  add column height integer,
  add column original_staging_path text;

-- Evita subir dos veces el mismo media item si un reintento se solapa
-- con una sincronización que ya había terminado.
create unique index event_media_google_media_item_id_key
  on public.event_media (google_media_item_id)
  where google_media_item_id is not null;

-- Bucket de tránsito: privado, un objeto acá vive solo entre el upload
-- del browser y la subida a Google Photos (segundos a minutos) — no es
-- almacenamiento final, así que no hace falta guardarlo para siempre.
-- 45MB de margen, por debajo del tope de 50MB por objeto del plan Free
-- de Supabase (mismo criterio que 0004 usó para event-photos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-photos-originals', 'event-photos-originals', false,
  47185920,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "Cualquier logueado sube su original en transito"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-photos-originals' and owner = auth.uid());

create policy "El uploader lee su propio original en transito"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'event-photos-originals' and owner = auth.uid());

create policy "El uploader borra su propio original en transito"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos-originals' and owner = auth.uid());
