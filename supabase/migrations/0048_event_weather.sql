-- Clima del evento: el último pronóstico guardado para la hora del evento, que se
-- va actualizando hasta que el evento empieza y después queda fijo.
--
-- La app lo pide a Open-Meteo (gratis, sin clave) al abrir el evento, si el dato
-- falta o tiene más de unas horas, y lo guarda acá con la sesión de quien abrió la
-- página. Una fila por evento: solo el último pronóstico, no un historial.
--
-- «Queda fijo» lo hace cumplir la base: las policies de insert y de update dejan
-- escribir solo mientras el evento no empezó; pasada esa hora nadie puede cambiarlo
-- —ni siquiera un admin—. No hay policy de delete: se borra con el evento.
--
-- Cuándo empieza un evento: `events.event_date` guarda la hora tipeada tal cual, sin
-- conversión de zona (specs/003-eventos.md): los dígitos son la hora local. El resto
-- de la app los lee como si fueran UTC (por eso un evento figura «pasado» 3 horas
-- antes de su hora real en Buenos Aires); para el clima se lee la hora real, porque
-- el último pronóstico, el de la tarde del evento, es el que más importa. Esa
-- conversión vive en private.event_starts_at (Buenos Aires no tiene horario de
-- verano, así que alcanza con el nombre de la zona).
--
-- `forecast_for` es la hora de pared (sin zona) de la ciudad consultada que se eligió
-- del pronóstico: sirve para detectar que se movió la fecha del evento y hay que
-- volver a pedirlo.
--
-- Ver specs/024-clima-del-evento.md. Se revierte con
--   drop table public.event_weather;
--   drop function private.event_starts_at(timestamptz);

-- Con search_path fijo desde el principio: es lo que pide el linter de seguridad.
create or replace function private.event_starts_at(p_event_date timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_event_date at time zone 'UTC') at time zone 'America/Argentina/Buenos_Aires';
$$;

-- Las policies la llaman con el rol authenticated (mismo patrón que la 0044).
revoke all on function private.event_starts_at(timestamptz) from public, anon;
grant execute on function private.event_starts_at(timestamptz) to authenticated;

create table public.event_weather (
  event_id uuid primary key references public.events (id) on delete cascade,
  forecast_for timestamp not null,
  temperature_c numeric(4, 1),
  precipitation_probability smallint check (precipitation_probability between 0 and 100),
  precipitation_mm numeric(5, 1) check (precipitation_mm >= 0),
  wind_kmh numeric(5, 1) check (wind_kmh >= 0),
  weather_code smallint check (weather_code between 0 and 99),
  fetched_at timestamptz not null default now()
);

alter table public.event_weather enable row level security;

create policy "Cualquier logueado ve el clima de un evento"
  on public.event_weather for select
  to authenticated
  using (true);

create policy "Cualquier logueado guarda el clima de un evento que no empezo"
  on public.event_weather for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_weather.event_id and now() < private.event_starts_at(e.event_date)
    )
  );

create policy "Cualquier logueado actualiza el clima de un evento que no empezo"
  on public.event_weather for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
       where e.id = event_weather.event_id and now() < private.event_starts_at(e.event_date)
    )
  )
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_weather.event_id and now() < private.event_starts_at(e.event_date)
    )
  );
