-- Mismo criterio que 0025 (admin puede sacar cualquier invitado): un
-- admin puede borrar cualquier foto, no solo quien la subió o quien
-- creó el evento — tanto la fila en event_media como el archivo en
-- Storage (deleteEventMedia hace ambas operaciones), sin esto el
-- borrado le fallaría silenciosamente a un admin por RLS aunque la UI
-- le muestre el botón.
create policy "Un admin puede borrar cualquier foto"
  on public.event_media for delete
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Un admin puede borrar cualquier foto en storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos' and public.is_admin(auth.uid()));
