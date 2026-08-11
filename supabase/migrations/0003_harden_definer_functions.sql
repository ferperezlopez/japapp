-- Los linters de seguridad de Supabase marcan que handle_new_user() y
-- is_group_member() son funciones SECURITY DEFINER invocables por
-- cualquiera via la REST API (/rest/v1/rpc/...). No estan pensadas para
-- llamarse directamente (son helpers internos de un trigger y de las
-- policies de RLS), asi que las movemos a un schema no expuesto por
-- PostgREST. ALTER FUNCTION ... SET SCHEMA conserva el OID de la funcion,
-- asi que el trigger on_auth_user_created y las policies que ya usan
-- is_group_member(...) se siguen resolviendo sin tocarlos.

create schema if not exists private;

alter function public.handle_new_user() set schema private;
revoke all on function private.handle_new_user() from public, anon, authenticated;

alter function public.is_group_member(uuid, uuid) set schema private;
revoke all on function private.is_group_member(uuid, uuid) from public, anon;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
