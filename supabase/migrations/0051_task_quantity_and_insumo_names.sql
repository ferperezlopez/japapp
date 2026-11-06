-- Tareas e insumos: cantidad opcional en «Compra de insumos» y nombres con mayúscula inicial.
--
-- 1) Cantidad opcional. Cada fila de event_tasks es una asignación (una persona trae un insumo).
--    `quantity` es texto libre ("2 kg", "3 litros", "1 pack") de hasta 40 caracteres, solo para
--    «Compra de insumos». Es por asignación y no por insumo del catálogo porque la cantidad
--    depende de quién lo trae y de cada evento (el catálogo se comparte con Gastos).
--
--    Hasta hoy event_tasks no tenía policy de UPDATE (la 0012 la sacó: reasignar era sacar y
--    sumar), así que completar o corregir la cantidad de una asignación ya hecha obligaba a
--    borrarla y volver a sumarla (y a re-notificar a la persona). Ahora se puede cambiar SOLO la
--    cantidad: UPDATE por columna (quantity, updated_by, updated_at; mismo patrón que la 0040 en
--    profiles), una policy permisiva para cualquier logueado (el mismo criterio de confianza del
--    grupo que ya rige el alta y la baja) y una restrictiva para los eventos cerrados (molde de
--    la 0044: pasadas las 24 h solo un admin).
--
-- 2) Los insumos del catálogo (insumo_items) empiezan siempre con mayúscula. La app ya lo hace al
--    crearlos; el trigger lo garantiza para cualquier alta o cambio de nombre (y recorta los
--    espacios de los costados). Solo toca la primera letra: «Coca cola», «7up», «Ñoquis». Como
--    corre antes de la restricción unique(name), dar de alta «servilletas» cuando ya existe
--    «Servilletas» choca con el existente en vez de crear un duplicado en minúscula. También
--    corrige los que ya estaban cargados (hoy solo «servilletas», con un uso y sin «Servilletas»
--    que lo duplique).
--
-- Ver specs/013-invitados-tareas-y-stats.md. Se revierte con
--   drop trigger insumo_items_capitalize_name on public.insumo_items;
--   drop function private.capitalize_insumo_name();
--   drop policy "Evento cerrado: tareas solo de un admin (cambio)" on public.event_tasks;
--   drop policy "Cualquier logueado puede cambiar la cantidad de un insumo" on public.event_tasks;
--   revoke update (quantity, updated_by, updated_at) on public.event_tasks from authenticated;
--   grant update on public.event_tasks to anon, authenticated;
--   alter table public.event_tasks drop column quantity;  -- pierde las cantidades ya cargadas
-- (los nombres que ya quedaron con mayúscula no vuelven a minúscula).

-- 1) Cantidad por asignación ---------------------------------------------------------------
alter table public.event_tasks
  add column quantity text,
  add constraint event_tasks_quantity_format check (
    quantity is null or (quantity = btrim(quantity) and char_length(quantity) between 1 and 40)
  ),
  add constraint event_tasks_quantity_only_insumos check (
    quantity is null or task_type = 'compra_insumos'
  );

-- Sin UPDATE de tabla (ni para anon): solo estas tres columnas, y nunca a quién se le asignó, qué
-- insumo, de qué tarea ni de qué evento. `updated_by` y `updated_at` sirven para dejar a quién
-- corrigió la cantidad (la policy exige que sea quien la corrige).
revoke update on public.event_tasks from anon, authenticated;
grant update (quantity, updated_by, updated_at) on public.event_tasks to authenticated;

create policy "Cualquier logueado puede cambiar la cantidad de un insumo"
  on public.event_tasks for update
  to authenticated
  using (task_type = 'compra_insumos')
  with check (updated_by = auth.uid());

create policy "Evento cerrado: tareas solo de un admin (cambio)"
  on public.event_tasks as restrictive for update
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()))
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

-- 2) Insumos con mayúscula inicial ----------------------------------------------------------
create or replace function private.capitalize_insumo_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.name := upper(left(new.name, 1)) || substr(new.name, 2);
  return new;
end
$$;

revoke all on function private.capitalize_insumo_name() from public, anon, authenticated;

-- «of name»: cambiar solo el ícono (lo hace un admin) no pasa por acá.
drop trigger if exists insumo_items_capitalize_name on public.insumo_items;
create trigger insumo_items_capitalize_name
  before insert or update of name on public.insumo_items
  for each row execute function private.capitalize_insumo_name();

-- Los que ya estaban cargados en minúscula.
update public.insumo_items
   set name = upper(left(btrim(name), 1)) || substr(btrim(name), 2)
 where name is distinct from upper(left(btrim(name), 1)) || substr(btrim(name), 2);
