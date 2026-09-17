-- Coordenadas GPS opcionales por lugar, para poder mostrar un link
-- "Ver en el mapa" en el evento. Nullable, sin policy de update (mismo
-- criterio que host_user_id): el pin solo se carga al crear el lugar,
-- no se puede agregar después a uno ya guardado.
alter table public.venues add column lat double precision;
alter table public.venues add column lng double precision;
