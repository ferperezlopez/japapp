-- Permite que un invitado (sin fila en profiles) también pueda quedar
-- asignado a un equipo. user_id pasa a ser opcional y se suma
-- event_guest_id; exactamente uno de los dos debe estar seteado. La PK
-- compuesta por user_id ya no sirve (un invitado no tiene uno), se
-- reemplaza por un id propio + unique parciales por cada identidad.
alter table public.futbol_teams drop constraint futbol_teams_pkey;
alter table public.futbol_teams add column id uuid not null default gen_random_uuid();
alter table public.futbol_teams add constraint futbol_teams_pkey primary key (id);
alter table public.futbol_teams alter column user_id drop not null;
alter table public.futbol_teams add column event_guest_id uuid references public.event_guests (id) on delete cascade;
alter table public.futbol_teams add constraint futbol_teams_one_identity_check
  check ((user_id is not null) <> (event_guest_id is not null));
create unique index futbol_teams_event_user_uidx on public.futbol_teams (event_id, user_id) where user_id is not null;
create unique index futbol_teams_event_guest_uidx on public.futbol_teams (event_id, event_guest_id) where event_guest_id is not null;
