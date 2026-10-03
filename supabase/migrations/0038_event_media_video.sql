-- Habilita subir video además de foto (ver specs/019-fotos-y-google-photos.md
-- y la ronda de "habilitar subir videos"): mismo pipeline de dos copias ya
-- usado para fotos (preview en Supabase + original en Google Photos), con
-- el mismo tope de ~45MB por archivo que ya rige para el original de una
-- foto — sin chunked upload ni cambio de plan de Supabase por ahora.

alter table public.event_media
  add column media_type text not null default 'photo'
    check (media_type in ('photo', 'video'));

-- El bucket de tránsito a Google Photos pasa a aceptar también video de
-- celular (mp4 nativo de Android, mov de iPhone, webm de navegadores
-- desktop). El tope de tamaño (47185920, ~45MB) no cambia.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm'
]
where id = 'event-photos-originals';
