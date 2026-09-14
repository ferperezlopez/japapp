-- JAPapp: lista de lugares sugeridos al crear un evento. No es un catálogo
-- cerrado: al crear un evento con un lugar nuevo (que no está en la lista),
-- ese lugar se agrega acá para quedar disponible la próxima vez.
--
-- Ver specs/007-lugares-de-evento.md para el detalle completo.

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.venues enable row level security;

create policy "Cualquier usuario logueado ve los lugares"
  on public.venues for select
  to authenticated
  using (true);

create policy "Cualquier usuario logueado puede agregar un lugar"
  on public.venues for insert
  to authenticated
  with check (created_by = auth.uid());
