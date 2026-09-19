-- MVP/goleador ahora pueden ser un invitado (sin fila en profiles) —
-- mismo patrón que futbol_teams (0026): columna paralela +
-- event_guest_id. A diferencia de futbol_teams, acá es válido no
-- elegir a nadie (ambas columnas de un par en null), así que la
-- constraint es "a lo sumo uno", no "exactamente uno". "on delete set
-- null" (no cascade): sacar al invitado del evento no debe borrar el
-- resto de las estadísticas (resultado, el otro campo).
alter table public.futbol_stats add column mvp_event_guest_id uuid references public.event_guests (id) on delete set null;
alter table public.futbol_stats add column goleador_event_guest_id uuid references public.event_guests (id) on delete set null;
alter table public.futbol_stats add constraint futbol_stats_mvp_one_identity_check
  check (mvp_user_id is null or mvp_event_guest_id is null);
alter table public.futbol_stats add constraint futbol_stats_goleador_one_identity_check
  check (goleador_user_id is null or goleador_event_guest_id is null);

-- Invitados editables — decisión explícita del usuario: solo admins
-- (mismo criterio que otras ediciones sensibles del repo, ej.
-- insumo_items.icon en 0027). No había ninguna policy de update en
-- guests hasta ahora.
create policy "Un admin puede editar el nombre de un invitado"
  on public.guests for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
