-- Además de quien sumó al invitado, un admin puede sacar a cualquiera:
-- sin esto, un admin no podía sacar un invitado (o, como pasó, un
-- perfil confundido con invitado) que no había sumado él mismo.
create policy "Un admin puede sacar cualquier invitado"
  on public.event_guests for delete
  to authenticated
  using (public.is_admin(auth.uid()));
