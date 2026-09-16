-- Ajustes a event_tasks a partir de feedback sobre PR #25 (ver
-- specs/013-invitados-tareas-y-stats.md):
-- 1. "Convocatoria" deja de ser una tarea seteable: se asume que la
--    hace quien creó el evento (events.created_by, ya visible como
--    "Creado por" en la UI).
-- 2. "Compra de insumos", "lavado de platos" y "orden de la sede"
--    pasan a admitir varias personas asignadas.

delete from public.event_tasks where task_type = 'convocatoria';
alter table public.event_tasks drop constraint event_tasks_task_type_check;
alter table public.event_tasks add constraint event_tasks_task_type_check
  check (task_type in ('compra_insumos', 'lavado_platos', 'orden_sede', 'reserva_cancha'));

-- La PK compuesta (event_id, task_type) solo permitía una fila (= una
-- persona) por tarea. Ahora una fila = una asignación, así que puede
-- haber varias filas por (event_id, task_type). "Reserva de cancha"
-- sigue usando esta misma tabla con una sola fila a la vez (la UI la
-- trata como single-select: reemplaza en vez de sumar).
alter table public.event_tasks drop constraint event_tasks_pkey;
delete from public.event_tasks where assigned_to is null;
alter table public.event_tasks
  add column id uuid not null default gen_random_uuid() primary key;
alter table public.event_tasks alter column assigned_to set not null;
alter table public.event_tasks
  add constraint event_tasks_event_task_assignee_key unique (event_id, task_type, assigned_to);

-- Reasignar ahora es sacar una fila y sumar otra, no un update de la
-- misma fila — la policy de "reasignar" ya no aplica; hace falta una
-- de delete, con el mismo criterio de confianza total que ya regía.
drop policy "Cualquier logueado puede reasignar una tarea" on public.event_tasks;
create policy "Cualquier logueado puede sacar a alguien de una tarea"
  on public.event_tasks for delete
  to authenticated
  using (true);
