-- Permite editar un lugar ya guardado (nombre, dirección, dueño de casa) —
-- mismo criterio de confianza total que event_tasks/futbol_stats: cualquier
-- logueado puede editar, sin restringirlo a quien lo creó.
create policy "Cualquier logueado puede editar un lugar"
  on public.venues for update
  to authenticated
  using (true)
  with check (true);
