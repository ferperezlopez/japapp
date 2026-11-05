-- Sedes: ubicación (para el clima) y edición controlada.
--
-- 1) El clima del evento tiene que ser el del lugar donde se hace, no el de una ciudad
--    fija. Las sedes guardan un link de Google Maps (`address`), pero de un link no se
--    puede pronosticar nada: hacen falta coordenadas. La app las saca del link al guardar
--    la sede (src/lib/eventos/venueLocation.ts) y las deja en `venues.lat` / `venues.lng`.
--    `event_weather` anota con qué ubicación se pidió cada pronóstico: si la sede cambia de
--    link, o es un pronóstico viejo (el de Buenos Aires de antes de esta migración, que
--    queda con la ubicación en nulo), la app sabe que no corresponde y lo vuelve a pedir.
--
-- 2) Una sede tiene que poder corregirse (nombre, link de GPS, de quién es la casa). Los
--    eventos la nombran por TEXTO (`events.location`, sin clave foránea), así que renombrar
--    una sede obliga a renombrarla en sus eventos, también en los cerrados o saldados (las
--    policies de la 0044 no dejan tocarlos): lo hace `update_venue`, que es `security
--    definer`, en una sola transacción. Cualquier logueado puede editar una sede (como decía
--    la policy de la 0022: son datos compartidos del grupo).
--    La policy de `UPDATE` directo de la 0022 se saca: sin ella, la única forma de modificar
--    una sede es esa función, y nadie puede renombrarla por la API dejando eventos huérfanos.
--    El alta (`INSERT`, también el `upsert ... ignoreDuplicates` de la app) no cambia.
--
-- `set_venue_coordinates` es la salida para las sedes que ya tenían link y no coordenadas
-- (las anteriores a esta migración): la app las resuelve al calcular el clima y las completa
-- con esta función, que solo escribe si lat y lng están en nulo (nunca pisa).
--
-- Ver specs/007-lugares-de-evento.md y specs/024-clima-del-evento.md. Se revierte con
--   drop function public.update_venue(uuid, text, text, uuid, double precision, double precision);
--   drop function public.set_venue_coordinates(uuid, double precision, double precision);
--   alter table public.event_weather drop column lat, drop column lng;
--   alter table public.venues drop column lat, drop column lng;
--   create policy "Cualquier logueado puede editar un lugar"
--     on public.venues for update to authenticated using (true) with check (true);

alter table public.venues
  add column lat double precision,
  add column lng double precision,
  add constraint venues_location_pair check ((lat is null) = (lng is null)),
  add constraint venues_location_range check (
    lat is null
    or (lat between -90 and 90 and lng between -180 and 180 and not (lat = 0 and lng = 0))
  );

alter table public.event_weather
  add column lat double precision,
  add column lng double precision,
  add constraint event_weather_location_pair check ((lat is null) = (lng is null)),
  add constraint event_weather_location_range check (
    lat is null or (lat between -90 and 90 and lng between -180 and 180)
  );

create or replace function public.update_venue(
  p_venue_id uuid,
  p_name text,
  p_address text,
  p_host_user_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_name text;
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if v_uid is null then
    raise exception 'No estás logueado.' using errcode = '28000';
  end if;

  -- El candado de fila serializa dos ediciones simultáneas de la misma sede.
  select name into v_old_name from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'No se encontró ese lugar.' using errcode = 'P0002';
  end if;

  if v_name = '' then
    raise exception 'Poné un nombre para el lugar.' using errcode = '22023';
  end if;
  if v_name <> v_old_name and exists (select 1 from public.venues where name = v_name) then
    raise exception 'Ya hay un lugar con ese nombre.' using errcode = '23505';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'La ubicación necesita latitud y longitud.' using errcode = '22023';
  end if;

  update public.venues
     set name = v_name,
         address = v_address,
         host_user_id = p_host_user_id,
         lat = p_lat,
         lng = p_lng
   where id = p_venue_id;

  -- Los eventos nombran la sede por texto: se renombran con ella.
  if v_name <> v_old_name then
    update public.events set location = v_name where location = v_old_name;
  end if;
end;
$$;

create or replace function public.set_venue_coordinates(
  p_venue_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No estás logueado.' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'La ubicación necesita latitud y longitud.' using errcode = '22023';
  end if;

  -- Solo completa lo que falta: nunca pisa una ubicación ya cargada.
  update public.venues
     set lat = p_lat, lng = p_lng
   where id = p_venue_id and lat is null and lng is null;
end;
$$;

-- Las funciones de public quedan ejecutables por anon por los default privileges de
-- Supabase: se lo sacamos explícitamente (sin sesión las dos igual se rechazan).
revoke all on function public.update_venue(uuid, text, text, uuid, double precision, double precision)
  from public, anon;
grant execute on function public.update_venue(uuid, text, text, uuid, double precision, double precision)
  to authenticated;
revoke all on function public.set_venue_coordinates(uuid, double precision, double precision)
  from public, anon;
grant execute on function public.set_venue_coordinates(uuid, double precision, double precision)
  to authenticated;

drop policy if exists "Cualquier logueado puede editar un lugar" on public.venues;
