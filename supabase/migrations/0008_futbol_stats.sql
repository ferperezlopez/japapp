-- JAPapp: estadisticas del partido de futbol de un evento (resultado, MVP,
-- goleador destacado). Una fila por evento, cualquier logueado puede
-- cargarla o corregirla despues -- mismo criterio de confianza total que
-- ya usan RSVPs y estadisticas de eventos.
--
-- Ver specs/010-estadisticas-de-partidos.md para el detalle completo.

create table public.futbol_stats (
  event_id uuid primary key references public.events (id) on delete cascade,
  resultado text,
  mvp_user_id uuid references public.profiles (id),
  goleador_user_id uuid references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.futbol_stats enable row level security;

create policy "Cualquier logueado ve las estadisticas de partidos"
  on public.futbol_stats for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede cargar estadisticas de un partido"
  on public.futbol_stats for insert
  to authenticated
  with check (updated_by = auth.uid());

create policy "Cualquier logueado puede actualizar estadisticas de un partido"
  on public.futbol_stats for update
  to authenticated
  using (true)
  with check (updated_by = auth.uid());
