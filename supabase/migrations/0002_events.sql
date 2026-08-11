-- JAPapp: eventos (ej: "JAPA del viernes") y confirmaciones de asistencia.
--
-- A diferencia de los grupos de gastos, los eventos son visibles para
-- cualquier usuario logueado de la app: se asume que todos los que entran
-- a JAPapp son parte del mismo grupo de amigos.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date timestamptz not null,
  location text,
  description text,
  -- Enlace opcional a un grupo de gastos, reservado para poder calcular
  -- el costo del evento a futuro (sección de estadísticas).
  group_id uuid references public.groups (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('yes', 'no', 'maybe')),
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

create policy "Cualquier usuario logueado ve los eventos"
  on public.events for select
  to authenticated
  using (true);

create policy "Cualquier usuario logueado puede crear un evento"
  on public.events for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Quien creo el evento lo puede editar"
  on public.events for update
  to authenticated
  using (created_by = auth.uid());

create policy "Quien creo el evento lo puede borrar"
  on public.events for delete
  to authenticated
  using (created_by = auth.uid());

create policy "Cualquier usuario logueado ve quien se confirmo"
  on public.event_rsvps for select
  to authenticated
  using (true);

create policy "Un usuario puede confirmar su propia asistencia"
  on public.event_rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Un usuario puede cambiar su propia confirmacion"
  on public.event_rsvps for update
  to authenticated
  using (user_id = auth.uid());

create policy "Un usuario puede borrar su propia confirmacion"
  on public.event_rsvps for delete
  to authenticated
  using (user_id = auth.uid());
