-- JAPapp: cada evento consigue automaticamente su grupo de gastos
-- (events.group_id, reservado desde 0002 para esto), quien confirma "voy"
-- se suma solo a ese grupo, y se agrega una galeria de fotos por evento
-- via Supabase Storage.
--
-- Decision de privacidad (confirmada explicitamente por el usuario):
--   - Ver gastos/balances de un evento: abierto a cualquier logueado,
--     aunque no haya confirmado asistencia (mismo criterio que events).
--   - Cargar un gasto: solo quien confirmo "voy" o es el creador del
--     evento (requiere membership real, sin cambios en insert/update/delete
--     de expenses/groups/group_members/expense_shares).
--
-- Ver specs/004-eventos-gastos-y-fotos.md para el detalle completo.

-- 0) Backfill: eventos existentes sin group_id ------------------------------
do $$
declare
  ev record;
  new_group_id uuid;
begin
  for ev in select id, name, created_by from public.events where group_id is null loop
    insert into public.groups (name, created_by)
    values (ev.name, ev.created_by)
    returning id into new_group_id;

    insert into public.group_members (group_id, user_id)
    values (new_group_id, ev.created_by)
    on conflict do nothing;

    insert into public.group_members (group_id, user_id)
    select new_group_id, r.user_id
    from public.event_rsvps r
    where r.event_id = ev.id and r.status = 'yes'
    on conflict do nothing;

    update public.events set group_id = new_group_id where id = ev.id;
  end loop;
end $$;

-- 1) Trigger: todo evento nuevo consigue su grupo enlazado ------------------
create or replace function private.handle_new_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_group_id uuid;
begin
  insert into public.groups (name, created_by)
  values (new.name, new.created_by)
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id)
  values (new_group_id, new.created_by)
  on conflict do nothing;

  update public.events set group_id = new_group_id where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_event_created on public.events;
create trigger on_event_created
  after insert on public.events
  for each row
  when (new.group_id is null)
  execute function private.handle_new_event();

-- 2) Trigger: RSVP "yes" suma a group_members --------------------------------
-- Escucha insert y update: setRsvp() hace upsert, asi que confirmar de
-- nuevo "yes" despues de haber puesto "no"/"maybe" es un UPDATE, no INSERT.
create or replace function private.handle_rsvp_yes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_group_id uuid;
begin
  select group_id into target_group_id from public.events where id = new.event_id;

  if target_group_id is not null then
    insert into public.group_members (group_id, user_id)
    values (target_group_id, new.user_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rsvp_upsert on public.event_rsvps;
create trigger on_rsvp_upsert
  after insert or update on public.event_rsvps
  for each row
  when (new.status = 'yes')
  execute function private.handle_rsvp_yes();

-- 3) Relajar SOLO el select de groups/group_members/expenses/expense_shares
--    para grupos enlazados a un evento. insert/update/delete sin cambios:
--    siguen requiriendo is_group_member real (RSVP "yes" o creador).

drop policy "Los miembros ven los grupos a los que pertenecen" on public.groups;
create policy "Los miembros ven sus grupos, o cualquiera ve un grupo de evento"
  on public.groups for select
  to authenticated
  using (
    private.is_group_member(id)
    or exists (select 1 from public.events e where e.group_id = groups.id)
  );

drop policy "Los miembros ven la lista de miembros de sus grupos" on public.group_members;
create policy "Los miembros ven sus miembros, o cualquiera ve los de un grupo de evento"
  on public.group_members for select
  to authenticated
  using (
    private.is_group_member(group_id)
    or exists (select 1 from public.events e where e.group_id = group_members.group_id)
  );

drop policy "Los miembros ven los gastos de sus grupos" on public.expenses;
create policy "Los miembros ven sus gastos, o cualquiera ve los de un grupo de evento"
  on public.expenses for select
  to authenticated
  using (
    private.is_group_member(group_id)
    or exists (select 1 from public.events e where e.group_id = expenses.group_id)
  );

drop policy "Los miembros ven las partes de los gastos de sus grupos" on public.expense_shares;
create policy "Los miembros ven sus partes, o cualquiera ve las de un grupo de evento"
  on public.expense_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_shares.expense_id
        and (
          private.is_group_member(e.group_id)
          or exists (select 1 from public.events ev where ev.group_id = e.group_id)
        )
    )
  );

-- 4) Fotos de eventos --------------------------------------------------------

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.event_media enable row level security;

create policy "Cualquier logueado ve las fotos de un evento"
  on public.event_media for select
  to authenticated
  using (true);

create policy "Cualquier logueado puede subir fotos a un evento"
  on public.event_media for insert
  to authenticated
  with check (uploaded_by = auth.uid());

create policy "Quien subio la foto o el creador del evento la puede borrar"
  on public.event_media for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_media.event_id and e.created_by = auth.uid()
    )
  );

-- 5) Storage: bucket privado + policies en storage.objects ------------------
-- file_size_limit en bytes: 15MB, margen amplio sobre una foto de celular
-- promedio y bien por debajo del tope de 50MB del plan Free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-photos', 'event-photos', false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "Cualquier logueado ve fotos de eventos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'event-photos');

create policy "Cualquier logueado puede subir fotos de eventos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-photos');

create policy "Uploader o creador del evento borra la foto en storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-photos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.events e
        where e.id::text = (storage.foldername(name))[1]
          and e.created_by = auth.uid()
      )
    )
  );
