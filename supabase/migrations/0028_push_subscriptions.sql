-- Web Push: cada fila es una suscripción de un dispositivo/navegador a
-- notificaciones push (un usuario puede tener varias, una por
-- dispositivo). El dueño de la fila la administra por su cuenta (RLS
-- estándar); para *enviar* una notificación a otras personas hace
-- falta leer sus filas desde el navegador de quien dispara la acción
-- (ej. crear un evento) sin darle acceso general de lectura a la
-- tabla — se resuelve con una función security definer acotada, mismo
-- patrón que remove_event_futbol (0018) y find_similar_profile_names
-- (0015).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Un usuario administra sus propias suscripciones push"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.get_push_subscriptions_for_users(p_user_ids uuid[])
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = public
stable
as $$
  select ps.user_id, ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.user_id = any (p_user_ids)
$$;

grant execute on function public.get_push_subscriptions_for_users(uuid[]) to authenticated;

-- Al enviar, una suscripción puede haber quedado obsoleta (el navegador
-- la invalidó pero nunca llamó a unsubscribe) — el remitente necesita
-- poder limpiarla aunque no sea la suya.
create or replace function public.prune_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

grant execute on function public.prune_push_subscription(text) to authenticated;
