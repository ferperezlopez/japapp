-- Fix: la policy de select de notification_sends (0032) comparaba
-- "nr.send_id = nr.id" (el id de la propia fila de
-- notification_recipients) en vez de contra el id de la fila de
-- notification_sends — la columna "id" sin calificar se resuelve
-- contra la tabla más interna del FROM (notification_recipients), no
-- contra la tabla externa. Como consecuencia, ningún no-admin podía
-- ver sus propias notificaciones (ni la campanita ni, en el caso de
-- un admin viendo la suya propia sin el rol, el historial).
drop policy "Un admin ve todos los envíos; un destinatario ve los suyos" on public.notification_sends;

create policy "Un admin ve todos los envíos; un destinatario ve los suyos"
  on public.notification_sends for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.notification_recipients nr
      where nr.send_id = notification_sends.id and nr.user_id = auth.uid()
    )
  );

-- Emoji editable por gasto cuando no está ligado a un ítem del
-- catálogo (item_id null) — si item_id está seteado, el emoji sigue
-- viviendo en insumo_items.icon (0027), ya editable ahí.
alter table public.expenses add column icon text;

create policy "Un admin puede editar el emoji de un gasto"
  on public.expenses for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
