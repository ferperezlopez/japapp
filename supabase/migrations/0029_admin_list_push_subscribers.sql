-- Comunicaciones (admin, ver specs/017-push-notifications.md) necesita
-- mostrar quién activó las notificaciones — la policy de
-- push_subscriptions (0028) restringe a "solo mis propias filas", así
-- que un select directo desde /comunicaciones solo traería la fila del
-- propio admin. A diferencia de get_push_subscriptions_for_users (0028,
-- pensada para *enviar* un push, sin exponer quién es quién más allá de
-- lo necesario), acá el propósito es justamente listar personas, así
-- que esta función valida is_admin adentro en vez de confiar en que el
-- caller ya se filtró en la UI.
create or replace function public.get_push_subscriber_ids()
returns table (user_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select distinct ps.user_id
  from public.push_subscriptions ps
  where public.is_admin(auth.uid())
$$;

grant execute on function public.get_push_subscriber_ids() to authenticated;
