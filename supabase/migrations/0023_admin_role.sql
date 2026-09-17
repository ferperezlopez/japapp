-- Rol admin: por ahora una sola persona de máxima confianza. Cubre dos
-- capacidades pedidas por el usuario: (1) editar el perfil de cualquiera,
-- (2) "actuar como" otro usuario para RSVP, con la escritura atribuida al
-- usuario impersonado en vez de al admin real.
alter table public.profiles add column is_admin boolean not null default false;

-- security definer para evitar el problema de recursión de RLS al
-- consultar profiles.is_admin desde una policy de la propia tabla
-- profiles — mismo patrón que public.is_group_member (0001_init.sql).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- 1) Admin puede editar cualquier perfil (nombre/alias/avatar_url) — suma
-- a la policy existente "Un usuario puede actualizar su propio perfil"
-- (0001_init.sql), no la reemplaza.
create policy "Un admin puede editar cualquier perfil"
  on public.profiles for update
  to authenticated
  using (public.is_admin(auth.uid()));

-- 2) Admin puede subir/reemplazar el avatar de cualquiera en el bucket
-- avatars (hoy solo `(storage.foldername(name))[1] = auth.uid()::text`,
-- ver 0010_avatars_bucket.sql).
create policy "Un admin puede subir avatar de cualquiera"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and public.is_admin(auth.uid()));

create policy "Un admin puede reemplazar avatar de cualquiera"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin(auth.uid()))
  with check (bucket_id = 'avatars' and public.is_admin(auth.uid()));

-- 3) Admin puede confirmar/cambiar el RSVP de otro ("actuar como") — suma
-- a "Un usuario puede confirmar su propia asistencia" / "... cambiar su
-- propia confirmacion" (0002_events.sql), que exigen user_id = auth.uid():
-- sin esto, escribir el id del usuario impersonado (distinto del
-- auth.uid() real del admin) violaría el with check existente.
create policy "Un admin puede confirmar en nombre de otro (insert)"
  on public.event_rsvps for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "Un admin puede confirmar en nombre de otro (update)"
  on public.event_rsvps for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Otorgar el rol a Fernando Pérez López, confirmado con el usuario.
update public.profiles set is_admin = true
  where id = '9840e373-0124-40ea-8a5d-89e5ba5b9d73';
