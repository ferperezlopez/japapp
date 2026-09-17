-- "Quién trae" al invitado puede ser distinto de "quién hizo la carga"
-- (added_by, que sigue siendo el dueño de la fila a efectos de RLS de
-- borrado). Ej: Fernando suma a un invitado desde la app, pero quien
-- realmente lo trae al partido es Diego.
-- Se agrega nullable, se backfillea con added_by (mismo valor de hoy
-- para las filas existentes) y recién ahí se pone not null: un default
-- con auth.uid() no sirve porque esta migración corre sin sesión de
-- usuario.
alter table public.event_guests add column brought_by uuid references public.profiles (id);

update public.event_guests set brought_by = added_by where brought_by is null;

alter table public.event_guests alter column brought_by set not null;
