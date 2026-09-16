-- Sacar el fútbol de un evento (ej. "al final no se junta gente para
-- jugar") no debería requerir los mismos permisos que editar el evento
-- entero (nombre, fecha, lugar) — cualquier logueado debería poder
-- avisar que el fútbol no va, mismo criterio de confianza total que
-- RSVPs/tareas/futbol_stats. La policy de update de "events" exige ser
-- quien lo creó, así que esto pasa por una función acotada (solo apaga
-- has_futbol, security definer) en vez de abrir esa policy a cualquiera.
create or replace function public.remove_event_futbol(p_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events set has_futbol = false where id = p_event_id
$$;

grant execute on function public.remove_event_futbol(uuid) to authenticated;
