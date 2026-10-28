-- Además de quien creó el evento, un admin puede editar cualquiera (nombre,
-- fecha y hora, lugar, notas y si tiene fútbol). Hasta ahora la única policy
-- de UPDATE sobre events era "Quien creo el evento lo puede editar" (0002),
-- así que ni un admin podía corregir un evento ajeno: la UI le ocultaba el
-- lápiz y, si hubiera llegado a guardar, RLS le dejaba el UPDATE en 0 filas.
--
-- Es aditiva, mismo patrón que 0025 (invitados) y 0037 (fotos): en Postgres
-- las policies del mismo comando se combinan con OR. El creador sigue
-- editando por la suya (y su `with check`, que sin escribirlo es el `using`,
-- le sigue impidiendo reasignar `created_by`); el admin entra por esta.
--
-- Solo UPDATE. Borrar un evento —que arrastra las confirmaciones, los
-- invitados, las tareas y las fotos— sigue siendo solo de quien lo creó.
create policy "Un admin puede editar cualquier evento"
  on public.events for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
