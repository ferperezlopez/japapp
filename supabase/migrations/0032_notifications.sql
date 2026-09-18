-- Log de comunicaciones (admin, /comunicaciones) + campanita in-app: un
-- envío (qué se mandó, por qué disparador, y si fue un admin quien lo
-- compuso a mano) y, por separado, un renglón por destinatario (para el
-- estado de leído de cada uno) — independiente de si el push del
-- navegador efectivamente llegó a algún dispositivo.
create table public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'evento_nuevo', 'quorum_futbol', 'quorum_juntada',
    'equipos_armados', 'equipos_modificados', 'gasto_nuevo',
    'tarea_asignada', 'saldo_pendiente', 'comunicacion_manual'
  )),
  sent_by uuid references public.profiles (id), -- solo seteado en 'comunicacion_manual'
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now()
);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.notification_sends (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  unique (send_id, user_id)
);

create index notification_recipients_user_unread_idx
  on public.notification_recipients (user_id) where read_at is null;

alter table public.notification_sends enable row level security;
alter table public.notification_recipients enable row level security;

-- Cualquier acción de un miembro (no solo un admin) puede generar un
-- push a otros — mismo modelo de confianza total entre miembros ya
-- usado en el resto del repo (policies "using (true)" de altas).
create policy "Cualquier logueado puede registrar un envío"
  on public.notification_sends for insert
  to authenticated
  with check (true);

create policy "Cualquier logueado puede registrar destinatarios"
  on public.notification_recipients for insert
  to authenticated
  with check (true);

create policy "Un admin ve todos los envíos; un destinatario ve los suyos"
  on public.notification_sends for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.notification_recipients nr
      where nr.send_id = id and nr.user_id = auth.uid()
    )
  );

create policy "Un admin ve todos los destinatarios; cada uno ve los propios"
  on public.notification_recipients for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Cada uno marca como leídos sus propios avisos"
  on public.notification_recipients for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
