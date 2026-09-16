-- JAPapp: invitados que no son parte de la nómina (van a la JAPA o al
-- fútbol acompañando a un miembro registrado), tareas de organización por
-- evento, y a quién pertenece la sede.
--
-- Ver specs/013-invitados-tareas-y-stats.md para el detalle completo.

-- Invitados reusables entre eventos: no son usuarios de la app, sin auth ni
-- login. Una vez registrado un invitado, queda disponible para elegirlo de
-- nuevo en otro evento en vez de tener que re-tipear el nombre.
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Quién vino a qué evento como invitado. Sin columna "status": una fila acá
-- ya significa "confirmado que viene" (a diferencia de event_rsvps, un
-- invitado no tiene sentido en estado "tal vez"). added_by registra quién
-- lo sumó a ESTE evento en particular, que puede ser distinto de
-- guests.created_by (quién lo registró la primera vez).
create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  kind text not null default 'juntada' check (kind in ('juntada', 'futbol')),
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (event_id, guest_id, kind)
);

-- Tareas de organización por evento: lista fija de tipos, una persona
-- asignada por tipo (o ninguna todavía). "Creación del evento" no está acá
-- porque ya existe events.created_by.
create table public.event_tasks (
  event_id uuid not null references public.events (id) on delete cascade,
  task_type text not null check (task_type in (
    'compra_insumos', 'lavado_platos', 'orden_sede', 'reserva_cancha', 'convocatoria'
  )),
  assigned_to uuid references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (event_id, task_type)
);

-- "De quién es la casa" — separado de created_by (quién tipeó el nombre del
-- lugar por primera vez), son conceptos distintos.
alter table public.venues add column host_user_id uuid references public.profiles (id);

alter table public.guests enable row level security;
alter table public.event_guests enable row level security;
alter table public.event_tasks enable row level security;

create policy "Cualquier logueado ve los invitados"
  on public.guests for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede registrar un invitado"
  on public.guests for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Cualquier logueado ve quien vino de invitado"
  on public.event_guests for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede sumar un invitado a un evento"
  on public.event_guests for insert
  to authenticated
  with check (added_by = auth.uid());

create policy "Quien sumo al invitado lo puede sacar"
  on public.event_guests for delete
  to authenticated
  using (added_by = auth.uid());

create policy "Cualquier logueado ve las tareas"
  on public.event_tasks for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede asignar una tarea"
  on public.event_tasks for insert
  to authenticated
  with check (updated_by = auth.uid());

create policy "Cualquier logueado puede reasignar una tarea"
  on public.event_tasks for update
  to authenticated
  using (true)
  with check (updated_by = auth.uid());
