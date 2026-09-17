-- Emoji explícito por ítem, editable por admin — antes solo existía
-- derivado por palabra clave en el cliente (src/lib/eventos/insumos.ts),
-- nunca guardado ni editable.
alter table public.insumo_items add column icon text;

create policy "Un admin puede editar el ícono de un insumo"
  on public.insumo_items for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Gastos comparte este mismo catálogo (decisión del usuario): un gasto
-- puede opcionalmente linkear a un insumo_item, para heredar su emoji.
alter table public.expenses add column item_id uuid references public.insumo_items (id);
