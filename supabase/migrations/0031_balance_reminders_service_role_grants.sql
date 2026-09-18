-- El cron de recordatorio de saldo (item 7, specs/017-push-notifications.md)
-- corre sin sesión de usuario, con la service role key. Para poder
-- reusar sendPushToUsers tal cual desde ese endpoint, las dos
-- funciones security definer que usa (0028) necesitan el grant
-- también para service_role, no solo para authenticated.
grant execute on function public.get_push_subscriptions_for_users(uuid[]) to service_role;
grant execute on function public.prune_push_subscription(text) to service_role;
