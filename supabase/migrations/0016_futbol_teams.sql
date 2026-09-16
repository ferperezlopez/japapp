-- Equipos armados para un evento de fútbol: a qué equipo (1 o 2)
-- quedó cada jugador confirmado, y si es el arquero de ese equipo.
-- Se reemplaza completo al guardar (el modal maneja el estado entero
-- y hace un solo submit) — mismo criterio de "borrar todo y volver a
-- insertar" que ya usa setReservaCanchaAssignee en event_tasks, así
-- que no hace falta policy de update.
create table public.futbol_teams (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  team smallint not null check (team in (1, 2)),
  is_goalkeeper boolean not null default false,
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.futbol_teams enable row level security;

create policy "Cualquier logueado ve los equipos" on public.futbol_teams
  for select to authenticated using (true);
create policy "Cualquier logueado puede armar equipos" on public.futbol_teams
  for insert to authenticated with check (updated_by = auth.uid());
create policy "Cualquier logueado puede borrar equipos para rearmarlos" on public.futbol_teams
  for delete to authenticated using (true);
