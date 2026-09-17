-- Reemplaza el pin de GPS (lat/lng, cargado con un mapa Leaflet) por una
-- dirección de texto libre: el usuario probó el mapa y no lo necesita ahí,
-- solo poder registrar la dirección para que cualquier participante pueda
-- tocarla y que el dispositivo dispare la navegación (Google Maps resuelve
-- direcciones de texto sin necesitar coordenadas ni API key). Sin datos
-- existentes en lat/lng (confirmado antes de esta migración), así que no
-- hace falta backfill.
alter table public.venues drop column lat;
alter table public.venues drop column lng;
alter table public.venues add column address text;
