-- Feedback sobre PR #26: en "compra_insumos" cada persona asignada debe
-- especificar qué va a comprar (carne, snacks, bebidas, vinos, etc.).
-- Ver specs/013-invitados-tareas-y-stats.md para el detalle completo.

-- Catálogo reusable de insumos para comprar — mismo patrón que "guests":
-- una vez cargado un insumo, queda disponible para elegirlo de nuevo en
-- cualquier evento en vez de re-tipearlo. unique(name) sigue el mismo
-- criterio que venues.name.
create table public.insumo_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.insumo_items enable row level security;

create policy "Cualquier logueado ve los insumos"
  on public.insumo_items for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede cargar un insumo nuevo"
  on public.insumo_items for insert
  to authenticated
  with check (created_by = auth.uid());

-- Qué insumo trae cada persona asignada a "compra_insumos" — columna
-- nullable a nivel de tabla (no aplica a las otras tareas), pero
-- obligatoria vía constraint cuando task_type = 'compra_insumos'.
alter table public.event_tasks add column item_id uuid references public.insumo_items (id);
alter table public.event_tasks add constraint event_tasks_item_required_for_compra
  check (task_type <> 'compra_insumos' or item_id is not null);
