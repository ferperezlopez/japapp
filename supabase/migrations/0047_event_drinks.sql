-- Bebidas de un evento: cuánto se compró y cuánto se consumió realmente, por tipo.
--
-- La calculadora de bebidas (src/lib/calculators/bebidas.ts) sugiere cuánto
-- comprar según la cantidad de gente. Esta tabla guarda, de forma opcional, lo
-- que realmente pasó en un evento: cuánto se compró y cuánto se tomó de cada
-- tipo (vino en botellas, cerveza y gaseosa en litros, las unidades de la
-- calculadora), para poder comparar con lo sugerido y ajustarlo con datos.
--
-- Una fila por evento y tipo; las dos cantidades son opcionales, pero una fila
-- sin ninguna no tiene sentido (se borra). No hay cantidades de compra en ningún
-- otro lado: «Compra de insumos» y los gastos apuntan a un ítem del catálogo
-- (Vinos, Cervezas...) sin cantidad.
--
-- Mismo criterio de confianza que el resultado del partido (futbol_stats): cualquier
-- logueado carga y corrige mientras el evento no esté saldado; saldado, solo un
-- admin (policies restrictivas, mismo patrón que la 0044). Se cargan después
-- del evento, por eso el candado es el de «saldado» y no el de las 24 h.
--
-- Ver specs/023-bebidas-del-evento.md. Se revierte con
--   drop table public.event_drinks;

create table public.event_drinks (
  event_id uuid not null references public.events (id) on delete cascade,
  drink text not null check (drink in ('vino', 'cerveza', 'gaseosa')),
  bought numeric(7, 2) check (bought >= 0),
  consumed numeric(7, 2) check (consumed >= 0),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (event_id, drink),
  constraint event_drinks_has_a_value check (bought is not null or consumed is not null)
);

alter table public.event_drinks enable row level security;

create policy "Cualquier logueado ve las bebidas de un evento"
  on public.event_drinks for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede cargar las bebidas de un evento"
  on public.event_drinks for insert
  to authenticated
  with check (updated_by = auth.uid());

create policy "Cualquier logueado puede corregir las bebidas de un evento"
  on public.event_drinks for update
  to authenticated
  using (true)
  with check (updated_by = auth.uid());

create policy "Cualquier logueado puede sacar las bebidas de un evento"
  on public.event_drinks for delete
  to authenticated
  using (true);

-- Evento saldado: solo un admin (spec 022). Restrictivas, una por comando.
create policy "Evento saldado: bebidas solo de un admin (alta)"
  on public.event_drinks as restrictive for insert
  to authenticated
  with check (not private.event_is_settled(event_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: bebidas solo de un admin (cambio)"
  on public.event_drinks as restrictive for update
  to authenticated
  using (not private.event_is_settled(event_id) or public.is_admin(auth.uid()))
  with check (not private.event_is_settled(event_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: bebidas solo de un admin (baja)"
  on public.event_drinks as restrictive for delete
  to authenticated
  using (not private.event_is_settled(event_id) or public.is_admin(auth.uid()));
