-- JAPapp: fotos "legacy" — las que ya estaban cargadas antes de separar
-- "galería del evento" de "pool general de fotos" (usado por el carrusel
-- de la landing). Se ocultan de la galería de su evento pero siguen
-- contando para el carrusel — no se borran ni se mueven.
--
-- El UPDATE sin WHERE es intencional y de una sola vez: marca como
-- legacy exactamente lo que existe en el momento de correr esta
-- migración. Cualquier foto subida después de este momento entra con
-- legacy=false por default de columna.
--
-- Ver specs/011-fotos-legacy-y-carrusel.md.

alter table public.event_media add column legacy boolean not null default false;

update public.event_media set legacy = true;
